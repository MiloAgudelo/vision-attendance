/**
 * Matriz e2e del alcance (W6): duplicados, atrasados, revocado y reasignación de carnet.
 */

import { randomUUID } from 'node:crypto';

import {
  attendanceCorrections,
  attendances,
  cards,
  classSessions,
  enrollments,
  groups,
  rfidEvents,
  schedules,
  subjects,
} from '@va/db';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getSessionRoster } from '@/server/attendance/queries';
import { revokeDevice, setDeviceMode } from '@/server/devices/devices';
import { assignCardToStudent, listPendingCards } from '@/server/devices/enrollment';
import { TestWorkspace } from '@/server/events/test-fixtures';

import { DURING_CLASS, createClassGroup, createSimulator, enrollStudent } from './fixture';

let workspace: TestWorkspace;
const groupIds: string[] = [];
const subjectIds: string[] = [];
const track = { groupIds, subjectIds };

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
  } finally {
    await workspace.cleanup();
  }
});

describe('matriz e2e del alcance', () => {
  it('duplicados: mismo eventId es idempotente y un eventId nuevo responde already_registered', async () => {
    const { groupId } = await createClassGroup(workspace, track);
    const student = await enrollStudent(workspace, groupId);
    const device = await workspace.createDevice({ room: 'A-301' });
    const clock = { now: () => DURING_CLASS };
    const simulator = createSimulator(workspace, device.apiKey, clock);

    const eventId = randomUUID();
    const first = await simulator.send({ cardUid: student.uid, eventId });
    const replay = await simulator.repeat(3, { cardUid: student.uid, eventId });

    expect(first.response.ok).toBe(true);
    if (!first.response.ok) throw new Error('Primera lectura falló.');
    expect(first.response.result).toBe('registered');
    expect(replay).toHaveLength(3);
    for (const outcome of replay) {
      expect(outcome.response).toEqual(first.response);
    }

    clock.now = () => new Date('2026-08-11T23:12:00.000Z');
    const secondScan = await simulator.send({ cardUid: student.uid, eventId: randomUUID() });
    expect(secondScan.response.ok).toBe(true);
    if (!secondScan.response.ok) throw new Error('Segunda lectura falló.');
    expect(secondScan.response.result).toBe('already_registered');

    const roster = await getSessionRoster(first.response.session!.id, workspace.database);
    expect(roster.students.filter((row) => row.present)).toHaveLength(1);
  });

  it('atrasados: scannedAt desfasado no altera checked_in_at (RN8)', async () => {
    const { groupId } = await createClassGroup(workspace, track);
    const student = await enrollStudent(workspace, groupId);
    const device = await workspace.createDevice({ room: 'A-301' });
    const receivedAt = DURING_CLASS;
    const clock = { now: () => receivedAt };
    const simulator = createSimulator(workspace, device.apiKey, clock);

    const outcome = await simulator.send({
      cardUid: student.uid,
      scannedAt: '2020-01-01T00:00:00-05:00',
    });

    expect(outcome.response.ok).toBe(true);
    if (!outcome.response.ok) throw new Error('Lectura atrasada falló.');
    expect(outcome.response.result).toBe('registered');
    expect(outcome.response.receivedAt).toBe(receivedAt.toISOString());

    const roster = await getSessionRoster(outcome.response.session!.id, workspace.database);
    const present = roster.students.find((row) => row.id === student.id);
    expect(present?.checkedInAt?.toISOString()).toBe(receivedAt.toISOString());

    const [event] = await workspace.database
      .select({ scannedAt: rfidEvents.scannedAt, receivedAt: rfidEvents.receivedAt })
      .from(rfidEvents)
      .where(eq(rfidEvents.eventId, outcome.response.eventId))
      .limit(1);
    expect(event?.scannedAt).toEqual(new Date('2020-01-01T00:00:00-05:00'));
    expect(event?.receivedAt.toISOString()).toBe(receivedAt.toISOString());
  });

  it('revocado: el simulador recibe 403 y no queda rastro del evento', async () => {
    const device = await workspace.createDevice({ room: 'A-301' });
    await revokeDevice(device.id, { database: workspace.database });

    const clock = { now: () => DURING_CLASS };
    const simulator = createSimulator(workspace, device.apiKey, clock);
    const uid = workspace.nextCardUid();

    const outcome = await simulator.send({ cardUid: uid });
    expect(outcome.status).toBe(403);
    expect(outcome.response).toMatchObject({
      ok: false,
      error: 'device_revoked',
    });

    const rows = await workspace.database
      .select({ id: rfidEvents.id })
      .from(rfidEvents)
      .where(eq(rfidEvents.deviceId, device.id));
    expect(rows).toHaveLength(0);
  });

  it('reasignación: tras desactivar el carnet, el mismo UID queda con el nuevo estudiante', async () => {
    const { groupId } = await createClassGroup(workspace, track);
    const original = await enrollStudent(workspace, groupId);
    const replacement = await workspace.createStudent();
    await workspace.database.insert(enrollments).values({
      groupId,
      studentId: replacement.id,
    });

    const [oldCard] = await workspace.database
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.uid, original.uid), eq(cards.status, 'active')))
      .limit(1);
    expect(oldCard).toBeDefined();

    await workspace.database
      .update(cards)
      .set({ status: 'inactive' })
      .where(eq(cards.id, oldCard!.id));

    const device = await workspace.createDevice({ mode: 'enrollment', room: 'A-301' });
    const clock = { now: () => DURING_CLASS };
    const simulator = createSimulator(workspace, device.apiKey, clock);

    const capture = await simulator.send({ cardUid: original.uid });
    expect(capture.response.ok).toBe(true);
    if (!capture.response.ok) throw new Error('Captura de reasignación falló.');
    expect(capture.response.result).toBe('enrollment_captured');

    const pending = await listPendingCards({ database: workspace.database });
    const captured = pending.find((card) => card.uid === original.uid);
    expect(captured).toBeDefined();

    await assignCardToStudent(
      { cardId: captured!.id, studentId: replacement.id },
      { database: workspace.database },
    );
    await setDeviceMode(device.id, 'normal', { database: workspace.database });

    const registered = await simulator.send({ cardUid: original.uid });
    expect(registered.response.ok).toBe(true);
    if (!registered.response.ok) throw new Error('Registro tras reasignación falló.');
    expect(registered.response.result).toBe('registered');
    expect(registered.response.student?.code).toBe(replacement.studentCode);

    const roster = await getSessionRoster(registered.response.session!.id, workspace.database);
    expect(roster.students.find((row) => row.id === replacement.id)?.present).toBe(true);
    expect(roster.students.find((row) => row.id === original.id)?.present).toBe(false);
  });
});
