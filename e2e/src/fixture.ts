/**
 * Fixtures compartidos de la suite e2e W6.
 */

import { enrollments, groups, schedules, subjects } from '@va/db';
import { DeviceSimulator } from '@va/simulator';
import type { Database } from '@va/db';

import type { TestWorkspace } from '@/server/events/test-fixtures';

import { createIngestFetch } from './ingest-fetch';

/** Martes 2026-08-11 18:05 America/Bogota = 23:05 UTC. */
export const DURING_CLASS = new Date('2026-08-11T23:05:00.000Z');

export async function createClassGroup(
  workspace: TestWorkspace,
  track: { groupIds: string[]; subjectIds: string[] },
) {
  const [subject] = await workspace.database
    .insert(subjects)
    .values({
      code: `E2E-${workspace.prefix}-${track.subjectIds.length + 1}`,
      name: `Materia e2e ${track.subjectIds.length + 1}`,
    })
    .returning({ id: subjects.id });
  if (!subject) throw new Error('No se pudo crear la materia e2e.');
  track.subjectIds.push(subject.id);

  const [group] = await workspace.database
    .insert(groups)
    .values({
      subjectId: subject.id,
      name: `G${track.groupIds.length + 1}`,
      term: '2026-2',
      sessionWindowMinutes: 60,
    })
    .returning({ id: groups.id });
  if (!group) throw new Error('No se pudo crear el grupo e2e.');
  track.groupIds.push(group.id);

  await workspace.database.insert(schedules).values({
    groupId: group.id,
    weekday: 2,
    startTime: '18:00:00',
    endTime: '20:00:00',
    room: 'A-301',
  });

  return { subjectId: subject.id, groupId: group.id };
}

export async function enrollStudent(workspace: TestWorkspace, groupId: string) {
  const student = await workspace.createStudent();
  const uid = workspace.nextCardUid();
  await workspace.createCard(uid, { studentId: student.id });
  await workspace.database.insert(enrollments).values({ groupId, studentId: student.id });
  return { ...student, uid };
}

export function createSimulator(
  workspace: TestWorkspace,
  apiKey: string,
  clock: { now: () => Date },
) {
  return new DeviceSimulator({
    apiKey,
    fetch: createIngestFetch({
      database: workspace.database,
      now: () => clock.now(),
    }),
    now: () => clock.now(),
    maxAttempts: 1,
    timeoutMs: 5_000,
  });
}

export type { Database };
