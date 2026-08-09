/**
 * Matriz obligatoria de W4 contra PostgreSQL real (playbook §4).
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
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bearer, deviceEventBody, TestWorkspace } from '../events/test-fixtures';
import { ingestDeviceEvent } from '../events/ingest';
import { correctAttendance } from './corrections';
import { attendanceEngine } from './engine';
import { getSessionRoster } from './queries';

let workspace: TestWorkspace;
const groupIds: string[] = [];
const subjectIds: string[] = [];
const userIds: string[] = [];

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

async function createAcademicFixture(options: {
  weekday: number;
  startTime?: string;
  endTime?: string;
  windowMinutes?: number;
}) {
  const ordinal = groupIds.length + 1;
  const [subject] = await workspace.database
    .insert(subjects)
    .values({
      code: `W4-${workspace.prefix}-${ordinal}`,
      name: `Materia W4 ${ordinal}`,
    })
    .returning({ id: subjects.id });
  if (!subject) throw new Error('No se pudo crear la materia de prueba.');
  subjectIds.push(subject.id);

  const [group] = await workspace.database
    .insert(groups)
    .values({
      subjectId: subject.id,
      name: `G${ordinal}`,
      term: '2026-2',
      sessionWindowMinutes: options.windowMinutes ?? 60,
    })
    .returning({ id: groups.id });
  if (!group) throw new Error('No se pudo crear el grupo de prueba.');
  groupIds.push(group.id);

  const [schedule] = await workspace.database
    .insert(schedules)
    .values({
      groupId: group.id,
      weekday: options.weekday,
      startTime: options.startTime ?? '18:00:00',
      endTime: options.endTime ?? '20:00:00',
      room: 'A-301',
    })
    .returning({ id: schedules.id });
  if (!schedule) throw new Error('No se pudo crear el horario de prueba.');
  return { groupId: group.id, scheduleId: schedule.id };
}

async function createEnrolledStudent(groupId: string) {
  const student = await workspace.createStudent();
  const uid = workspace.nextCardUid();
  await workspace.createCard(uid, { studentId: student.id });
  await workspace.database.insert(enrollments).values({ groupId, studentId: student.id });
  return { ...student, uid };
}

async function scan(input: {
  device: Awaited<ReturnType<TestWorkspace['createDevice']>>;
  uid: string;
  receivedAt: string;
  eventId?: string;
  scannedAt?: string | null;
}) {
  const body = deviceEventBody({
    deviceId: input.device.name,
    cardUid: input.uid,
    ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    ...(input.scannedAt === undefined ? {} : { scannedAt: input.scannedAt }),
  });
  return ingestDeviceEvent({
    authorization: bearer(input.device.apiKey),
    body,
    database: workspace.database,
    attendanceEngine,
    now: () => new Date(input.receivedAt),
  });
}

async function scanWithDefaultEngine(input: {
  device: Awaited<ReturnType<TestWorkspace['createDevice']>>;
  uid: string;
  receivedAt: string;
}) {
  return ingestDeviceEvent({
    authorization: bearer(input.device.apiKey),
    body: deviceEventBody({ deviceId: input.device.name, cardUid: input.uid }),
    database: workspace.database,
    now: () => new Date(input.receivedAt),
  });
}

async function sessionsOf(groupId: string) {
  return workspace.database.select().from(classSessions).where(eq(classSessions.groupId, groupId));
}

describe('ventana y sesiones perezosas (RN2, RN3 y RN10)', () => {
  it('incluye exactamente -60 minutos y el fin; excluye el instante anterior y posterior', async () => {
    const academic = await createAcademicFixture({ weekday: 2 });
    const device = await workspace.createDevice({ room: 'A-301' });
    const students = [];
    for (let index = 0; index < 4; index += 1) {
      students.push(await createEnrolledStudent(academic.groupId));
    }

    const atWindowStart = await scan({
      device,
      uid: students[0]!.uid,
      receivedAt: '2026-08-11T22:00:00.000Z',
    });
    const atEnd = await scan({
      device,
      uid: students[1]!.uid,
      receivedAt: '2026-08-12T01:00:00.000Z',
    });
    const beforeWindow = await scan({
      device,
      uid: students[2]!.uid,
      receivedAt: '2026-08-11T21:59:59.999Z',
    });
    const afterEnd = await scan({
      device,
      uid: students[3]!.uid,
      receivedAt: '2026-08-12T01:00:00.001Z',
    });

    expect(atWindowStart.body).toMatchObject({ result: 'registered' });
    expect(atEnd.body).toMatchObject({ result: 'registered' });
    expect(beforeWindow.body).toMatchObject({ result: 'no_session', session: null });
    expect(afterEnd.body).toMatchObject({ result: 'no_session', session: null });
    expect(await sessionsOf(academic.groupId)).toHaveLength(1);
  });

  it('crea una sola sesión cuando dos primeros eventos llegan a la vez', async () => {
    const academic = await createAcademicFixture({ weekday: 4 });
    const device = await workspace.createDevice({ room: 'A-301' });
    const firstStudent = await createEnrolledStudent(academic.groupId);
    const secondStudent = await createEnrolledStudent(academic.groupId);

    const [first, second] = await Promise.all([
      scan({ device, uid: firstStudent.uid, receivedAt: '2026-08-13T23:15:00.000Z' }),
      scan({ device, uid: secondStudent.uid, receivedAt: '2026-08-13T23:15:00.000Z' }),
    ]);

    expect(first.body).toMatchObject({ result: 'registered' });
    expect(second.body).toMatchObject({ result: 'registered' });
    expect(await sessionsOf(academic.groupId)).toHaveLength(1);
  });
});

describe('registro e idempotencia (RN6, RN7 y RN8)', () => {
  it('usa el motor W4 por defecto en el pipeline real de ingesta', async () => {
    const academic = await createAcademicFixture({
      weekday: 3,
      startTime: '08:00:00',
      endTime: '10:00:00',
    });
    const device = await workspace.createDevice({ room: 'A-301' });
    const student = await createEnrolledStudent(academic.groupId);

    const result = await scanWithDefaultEngine({
      device,
      uid: student.uid,
      receivedAt: '2026-08-12T13:10:00.000Z',
    });

    expect(result.body).toMatchObject({ result: 'registered' });
    const [session] = await sessionsOf(academic.groupId);
    expect(session).toBeDefined();
    expect(
      await workspace.database
        .select()
        .from(attendances)
        .where(eq(attendances.sessionId, session!.id)),
    ).toHaveLength(1);
  });

  it('responde registered y luego already_registered para dos lecturas del mismo estudiante', async () => {
    const academic = await createAcademicFixture({ weekday: 5 });
    const device = await workspace.createDevice({ room: 'A-301' });
    const student = await createEnrolledStudent(academic.groupId);
    const absentStudent = await createEnrolledStudent(academic.groupId);

    const first = await scan({
      device,
      uid: student.uid,
      eventId: randomUUID(),
      receivedAt: '2026-08-14T23:10:00.000Z',
    });
    const second = await scan({
      device,
      uid: student.uid,
      eventId: randomUUID(),
      receivedAt: '2026-08-14T23:11:00.000Z',
    });

    expect(first.body).toMatchObject({ result: 'registered' });
    expect(second.body).toMatchObject({ result: 'already_registered' });
    const [session] = await sessionsOf(academic.groupId);
    const rows = await workspace.database
      .select()
      .from(attendances)
      .where(eq(attendances.sessionId, session!.id));
    expect(rows).toHaveLength(1);
    const roster = await getSessionRoster(session!.id, workspace.database);
    expect(roster.students).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: student.id, present: true, minutesFromStart: 10 }),
        expect.objectContaining({ id: absentStudent.id, present: false, minutesFromStart: null }),
      ]),
    );
  });

  it('reproduce el mismo eventId extremo a extremo sin duplicar asistencia', async () => {
    const academic = await createAcademicFixture({ weekday: 1 });
    const device = await workspace.createDevice({ room: 'A-301' });
    const student = await createEnrolledStudent(academic.groupId);
    const eventId = randomUUID();
    const input = {
      device,
      uid: student.uid,
      eventId,
      receivedAt: '2026-08-10T23:20:00.000Z',
    };

    const first = await scan(input);
    const replay = await scan({ ...input, receivedAt: '2026-08-10T23:25:00.000Z' });

    expect(first).toEqual(replay);
    const [session] = await sessionsOf(academic.groupId);
    expect(
      await workspace.database
        .select()
        .from(attendances)
        .where(eq(attendances.sessionId, session!.id)),
    ).toHaveLength(1);
  });

  it('serializa dos eventId simultáneos del mismo UID y conserva una asistencia', async () => {
    const academic = await createAcademicFixture({
      weekday: 7,
      startTime: '08:00:00',
      endTime: '10:00:00',
    });
    const device = await workspace.createDevice({ room: 'A-301' });
    const student = await createEnrolledStudent(academic.groupId);

    const [first, second] = await Promise.all([
      scan({
        device,
        uid: student.uid,
        eventId: randomUUID(),
        receivedAt: '2026-08-16T13:10:00.000Z',
      }),
      scan({
        device,
        uid: student.uid,
        eventId: randomUUID(),
        receivedAt: '2026-08-16T13:10:00.000Z',
      }),
    ]);

    expect([first.body, second.body]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ result: 'registered' }),
        expect.objectContaining({ result: 'already_registered' }),
      ]),
    );
    const [session] = await sessionsOf(academic.groupId);
    expect(
      await workspace.database
        .select()
        .from(attendances)
        .where(eq(attendances.sessionId, session!.id)),
    ).toHaveLength(1);
  });

  it('usa receivedAt del servidor aunque scannedAt esté desfasado', async () => {
    const academic = await createAcademicFixture({
      weekday: 1,
      startTime: '08:00:00',
      endTime: '10:00:00',
    });
    const device = await workspace.createDevice({ room: 'A-301' });
    const student = await createEnrolledStudent(academic.groupId);
    const officialTime = '2026-08-10T13:15:00.000Z';

    await scan({
      device,
      uid: student.uid,
      receivedAt: officialTime,
      scannedAt: '2020-01-01T00:00:00-05:00',
    });

    const [session] = await sessionsOf(academic.groupId);
    const [attendance] = await workspace.database
      .select()
      .from(attendances)
      .where(eq(attendances.sessionId, session!.id));
    expect(attendance?.checkedInAt).toEqual(new Date(officialTime));
  });
});

describe('resultados negativos', () => {
  it('crea la sesión pero no asistencia cuando el estudiante no está inscrito', async () => {
    const academic = await createAcademicFixture({ weekday: 3 });
    const device = await workspace.createDevice({ room: 'A-301' });
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const result = await scan({
      device,
      uid,
      receivedAt: '2026-08-12T23:15:00.000Z',
    });

    expect(result.body).toMatchObject({ result: 'not_enrolled' });
    const [session] = await sessionsOf(academic.groupId);
    expect(session).toBeDefined();
    expect(
      await workspace.database
        .select()
        .from(attendances)
        .where(eq(attendances.sessionId, session!.id)),
    ).toHaveLength(0);
  });

  it('no crea sesión ni asistencia fuera de cualquier horario', async () => {
    const academic = await createAcademicFixture({ weekday: 7 });
    const device = await workspace.createDevice({ room: 'A-301' });
    const student = await createEnrolledStudent(academic.groupId);

    const result = await scan({
      device,
      uid: student.uid,
      receivedAt: '2026-08-16T16:00:00.000Z',
    });

    expect(result.body).toMatchObject({ result: 'no_session', session: null });
    expect(await sessionsOf(academic.groupId)).toHaveLength(0);
  });
});

describe('correcciones y auditoría (RN9)', () => {
  it('crea, actualiza y elimina una asistencia manual dejando auditoría inmutable', async () => {
    const academic = await createAcademicFixture({ weekday: 6 });
    const device = await workspace.createDevice({ room: 'A-301' });
    const seedStudent = await createEnrolledStudent(academic.groupId);
    const correctedStudent = await createEnrolledStudent(academic.groupId);
    await scan({
      device,
      uid: seedStudent.uid,
      receivedAt: '2026-08-15T23:10:00.000Z',
    });
    const [session] = await sessionsOf(academic.groupId);
    const adminId = randomUUID();
    const teacherId = randomUUID();
    userIds.push(adminId, teacherId);
    await workspace.database.insert(users).values([
      {
        id: adminId,
        email: `admin-${workspace.prefix}@example.test`,
        fullName: 'Administradora W4',
        role: 'admin',
      },
      {
        id: teacherId,
        email: `teacher-${workspace.prefix}@example.test`,
        fullName: 'Profesor W4',
        role: 'teacher',
      },
    ]);

    await expect(
      correctAttendance(
        {
          sessionId: session!.id,
          studentId: correctedStudent.id,
          userId: teacherId,
          present: true,
          reason: 'Intento sin permiso',
        },
        workspace.database,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const created = await correctAttendance(
      {
        sessionId: session!.id,
        studentId: correctedStudent.id,
        userId: adminId,
        present: true,
        checkedInAt: '2026-08-15T23:20:00.000Z',
        reason: 'El lector no registró la entrada',
      },
      workspace.database,
    );
    const updated = await correctAttendance(
      {
        sessionId: session!.id,
        studentId: correctedStudent.id,
        userId: adminId,
        present: true,
        checkedInAt: '2026-08-15T23:22:00.000Z',
        reason: 'Se corrigió la hora',
        notes: 'Verificada por el administrador',
      },
      workspace.database,
    );
    const removed = await correctAttendance(
      {
        sessionId: session!.id,
        studentId: correctedStudent.id,
        userId: adminId,
        present: false,
        reason: 'Registro asignado a la persona equivocada',
      },
      workspace.database,
    );

    expect(created.action).toBe('mark_present');
    expect(updated.action).toBe('update');
    expect(removed.action).toBe('mark_absent');
    expect(
      await workspace.database
        .select()
        .from(attendances)
        .where(eq(attendances.studentId, correctedStudent.id)),
    ).toHaveLength(0);
    const audit = await workspace.database
      .select()
      .from(attendanceCorrections)
      .where(eq(attendanceCorrections.studentId, correctedStudent.id));
    expect(audit.map(({ action }) => action)).toEqual(['mark_present', 'update', 'mark_absent']);
    expect(audit[0]?.oldValue).toBeNull();
    expect(audit[1]?.oldValue).not.toBeNull();
    expect(audit[2]?.newValue).toBeNull();
  });
});
