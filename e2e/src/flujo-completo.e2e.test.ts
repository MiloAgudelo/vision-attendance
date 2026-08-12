/**
 * E2e W6: enrolar → escanear → roster en vivo → corregir → auditar.
 *
 * El simulador actúa como cliente del contrato v1; el transporte inyectado ejecuta el
 * pipeline real de ingesta contra PostgreSQL.
 */

import { randomUUID } from 'node:crypto';

import {
  attendanceCorrections,
  attendances,
  classSessions,
  enrollments,
  groups,
  schedules,
  subjects,
  users,
} from '@va/db';
import { DeviceSimulator } from '@va/simulator';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { correctAttendance } from '@/server/attendance/corrections';
import {
  getSessionRoster,
  listRfidEventLog,
  listSessionCorrections,
} from '@/server/attendance/queries';
import { setDeviceMode } from '@/server/devices/devices';
import { assignCardToStudent, listPendingCards } from '@/server/devices/enrollment';
import { TestWorkspace } from '@/server/events/test-fixtures';

import { createIngestFetch } from './ingest-fetch';

let workspace: TestWorkspace;
const groupIds: string[] = [];
const subjectIds: string[] = [];
const userIds: string[] = [];

/** Martes 2026-08-11 18:05 America/Bogota = 23:05 UTC (dentro de 18:00–20:00). */
const DURING_CLASS = new Date('2026-08-11T23:05:00.000Z');

beforeAll(() => {
  workspace = TestWorkspace.open();
});

afterAll(async () => {
  try {
    if (groupIds.length > 0) {
      const sessions = await workspace.database
        .select({ id: classSessions.id })
        .from(classSessions)
        .where(inArray(classSessions.groupId, groupIds));
      const sessionIds = sessions.map(({ id }) => id);
      if (sessionIds.length > 0) {
        await workspace.database
          .delete(attendanceCorrections)
          .where(inArray(attendanceCorrections.sessionId, sessionIds));
        await workspace.database
          .delete(attendances)
          .where(inArray(attendances.sessionId, sessionIds));
        await workspace.database.delete(classSessions).where(inArray(classSessions.id, sessionIds));
      }
      await workspace.database.delete(enrollments).where(inArray(enrollments.groupId, groupIds));
      await workspace.database.delete(schedules).where(inArray(schedules.groupId, groupIds));
      await workspace.database.delete(groups).where(inArray(groups.id, groupIds));
    }
    if (subjectIds.length > 0) {
      await workspace.database.delete(subjects).where(inArray(subjects.id, subjectIds));
    }
    if (userIds.length > 0) {
      await workspace.database.delete(users).where(inArray(users.id, userIds));
    }
  } finally {
    await workspace.cleanup();
  }
});

describe('flujo e2e con simulador', () => {
  it('enrola, registra asistencia, muestra roster, corrige y audita', async () => {
    const [admin] = await workspace.database
      .insert(users)
      .values({
        email: `admin-${workspace.prefix}@e2e.test`,
        fullName: 'Admin e2e',
        role: 'admin',
      })
      .returning({ id: users.id });
    if (!admin) throw new Error('No se pudo crear el administrador e2e.');
    userIds.push(admin.id);

    const [subject] = await workspace.database
      .insert(subjects)
      .values({ code: `E2E-${workspace.prefix}`, name: 'Laboratorio e2e' })
      .returning({ id: subjects.id });
    if (!subject) throw new Error('No se pudo crear la materia e2e.');
    subjectIds.push(subject.id);

    const [group] = await workspace.database
      .insert(groups)
      .values({
        subjectId: subject.id,
        name: 'G1',
        term: '2026-2',
        sessionWindowMinutes: 60,
      })
      .returning({ id: groups.id });
    if (!group) throw new Error('No se pudo crear el grupo e2e.');
    groupIds.push(group.id);

    await workspace.database.insert(schedules).values({
      groupId: group.id,
      weekday: 2,
      startTime: '18:00:00',
      endTime: '20:00:00',
      room: 'A-301',
    });

    const presentStudent = await workspace.createStudent();
    const absentStudent = await workspace.createStudent();
    await workspace.database.insert(enrollments).values([
      { groupId: group.id, studentId: presentStudent.id },
      { groupId: group.id, studentId: absentStudent.id },
    ]);

    const device = await workspace.createDevice({ mode: 'enrollment', room: 'A-301' });
    const newUid = workspace.nextCardUid();

    let clock = DURING_CLASS;
    const simulator = new DeviceSimulator({
      apiKey: device.apiKey,
      fetch: createIngestFetch({
        database: workspace.database,
        now: () => clock,
      }),
      now: () => clock,
      maxAttempts: 1,
      timeoutMs: 5_000,
    });

    // 1) Enrolar: carnet desconocido en modo enrollment.
    const enroll = await simulator.send({ cardUid: newUid });
    expect(enroll.response.ok).toBe(true);
    if (!enroll.response.ok) throw new Error('Enrolamiento falló.');
    expect(enroll.response.result).toBe('enrollment_captured');

    const pending = await listPendingCards({ database: workspace.database });
    const captured = pending.find((card) => card.uid === newUid);
    expect(captured).toBeDefined();

    await assignCardToStudent(
      { cardId: captured!.id, studentId: presentStudent.id },
      { database: workspace.database },
    );
    await setDeviceMode(device.id, 'normal', { database: workspace.database });

    // 2) Escanear en ventana de clase → asistencia.
    clock = DURING_CLASS;
    const registered = await simulator.send({ cardUid: newUid });
    expect(registered.response.ok).toBe(true);
    if (!registered.response.ok) throw new Error('Registro de asistencia falló.');
    expect(registered.response.result).toBe('registered');
    expect(registered.response.session?.id).toBeTruthy();

    const sessionId = registered.response.session!.id;

    // 3) Roster en vivo: presente + ausente calculado.
    const roster = await getSessionRoster(sessionId, workspace.database);
    const present = roster.students.find((row) => row.id === presentStudent.id);
    const absent = roster.students.find((row) => row.id === absentStudent.id);
    expect(present?.present).toBe(true);
    expect(present?.checkedInAt).toBeInstanceOf(Date);
    expect(absent?.present).toBe(false);
    expect(absent?.checkedInAt).toBeNull();

    // 4) Corregir: marcar ausente al presente (admin) y volver a presente.
    const markedAbsent = await correctAttendance(
      {
        sessionId,
        studentId: presentStudent.id,
        userId: admin.id,
        present: false,
        reason: 'Corrección e2e: carnet prestado',
      },
      workspace.database,
      () => clock,
    );
    expect(markedAbsent.action).toBe('mark_absent');

    const afterAbsent = await getSessionRoster(sessionId, workspace.database);
    expect(afterAbsent.students.find((row) => row.id === presentStudent.id)?.present).toBe(false);

    const markedPresent = await correctAttendance(
      {
        sessionId,
        studentId: presentStudent.id,
        userId: admin.id,
        present: true,
        reason: 'Corrección e2e: se confirma ingreso real',
        notes: 'Validado en puerta',
      },
      workspace.database,
      () => clock,
    );
    expect(markedPresent.action).toBe('mark_present');

    // 5) Auditar correcciones y bitácora RFID.
    const corrections = await listSessionCorrections(sessionId, workspace.database);
    expect(corrections.length).toBeGreaterThanOrEqual(2);
    expect(corrections.every((row) => row.userId === admin.id)).toBe(true);
    expect(corrections.some((row) => row.reason.includes('Corrección e2e'))).toBe(true);

    const events = await listRfidEventLog({ limit: 50 }, workspace.database);
    expect(
      events.some((event) => event.cardUid === newUid && event.result === 'enrollment_captured'),
    ).toBe(true);
    expect(events.some((event) => event.cardUid === newUid && event.result === 'registered')).toBe(
      true,
    );

    // Idempotencia del simulador: mismo eventId no duplica asistencia.
    const eventId = randomUUID();
    clock = new Date('2026-08-11T23:10:00.000Z');
    const first = await simulator.send({ cardUid: newUid, eventId });
    const second = await simulator.send({ cardUid: newUid, eventId });
    expect(first.response.ok).toBe(true);
    if (!first.response.ok) throw new Error('Reintento idempotente falló.');
    expect(first.response.result).toBe('already_registered');
    expect(second.response).toEqual(first.response);
  });
});
