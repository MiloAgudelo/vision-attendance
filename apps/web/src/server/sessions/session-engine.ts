/**
 * Resolución y creación perezosa de sesiones (RN2/RN3).
 */

import { classSessions, enrollments, groups, schedules } from '@va/db';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../events/types';
import { bogotaLocalDateTimeToUtc, getBogotaDateParts } from './timezone';

export interface SessionCandidate {
  scheduleId: string;
  groupId: string;
  sessionDate: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  enrolled: boolean;
  roomMatches: boolean;
}

function normalizedRoom(value: string | null): string | null {
  const normalized = value?.trim().toLocaleLowerCase('es-CO') ?? '';
  return normalized.length > 0 ? normalized : null;
}

/**
 * Busca las franjas cuya ventana contiene la hora oficial del evento.
 *
 * En el piloto normalmente hay una sola. Si hay varias, prioriza una inscripción activa, después
 * la coincidencia de salón y por último el inicio más cercano. Es una regla reversible para que
 * el modelo multi-grupo tenga un resultado determinista sin inventar una relación dispositivo-grupo.
 */
export async function findSessionCandidate(
  database: Database,
  input: { studentId: string; deviceRoom: string | null; receivedAt: Date },
): Promise<SessionCandidate | null> {
  const local = getBogotaDateParts(input.receivedAt);
  const rows = await database
    .select({
      scheduleId: schedules.id,
      groupId: groups.id,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
      scheduleRoom: schedules.room,
      sessionWindowMinutes: groups.sessionWindowMinutes,
      enrollmentId: enrollments.id,
    })
    .from(schedules)
    .innerJoin(groups, eq(groups.id, schedules.groupId))
    .leftJoin(
      enrollments,
      and(
        eq(enrollments.groupId, groups.id),
        eq(enrollments.studentId, input.studentId),
        eq(enrollments.status, 'active'),
      ),
    )
    .where(and(eq(groups.status, 'active'), eq(schedules.weekday, local.isoWeekday)));

  const deviceRoom = normalizedRoom(input.deviceRoom);
  const candidates = rows
    .map((row): SessionCandidate => {
      const scheduledStart = bogotaLocalDateTimeToUtc(local.date, row.startTime);
      const scheduledEnd = bogotaLocalDateTimeToUtc(local.date, row.endTime);
      const scheduleRoom = normalizedRoom(row.scheduleRoom);
      return {
        scheduleId: row.scheduleId,
        groupId: row.groupId,
        sessionDate: local.date,
        scheduledStart,
        scheduledEnd,
        enrolled: row.enrollmentId !== null,
        roomMatches: deviceRoom !== null && scheduleRoom !== null && deviceRoom === scheduleRoom,
      };
    })
    .filter((candidate, index) => {
      const row = rows[index]!;
      const windowStart = candidate.scheduledStart.getTime() - row.sessionWindowMinutes * 60_000;
      const received = input.receivedAt.getTime();
      return received >= windowStart && received <= candidate.scheduledEnd.getTime();
    });

  candidates.sort((left, right) => {
    if (left.enrolled !== right.enrolled) return left.enrolled ? -1 : 1;
    if (left.roomMatches !== right.roomMatches) return left.roomMatches ? -1 : 1;
    const leftDistance = Math.abs(input.receivedAt.getTime() - left.scheduledStart.getTime());
    const rightDistance = Math.abs(input.receivedAt.getTime() - right.scheduledStart.getTime());
    return (
      leftDistance - rightDistance || left.scheduledStart.getTime() - right.scheduledStart.getTime()
    );
  });

  return candidates[0] ?? null;
}

export interface ClassSessionRow {
  id: string;
  groupId: string;
  scheduleId: string | null;
  sessionDate: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

const sessionColumns = {
  id: classSessions.id,
  groupId: classSessions.groupId,
  scheduleId: classSessions.scheduleId,
  sessionDate: classSessions.sessionDate,
  scheduledStart: classSessions.scheduledStart,
  scheduledEnd: classSessions.scheduledEnd,
} as const;

/** INSERT ON CONFLICT + relectura: dos primeros eventos producen una sola sesión (RN3). */
export async function getOrCreateClassSession(
  database: Database,
  candidate: SessionCandidate,
): Promise<ClassSessionRow> {
  const [created] = await database
    .insert(classSessions)
    .values({
      groupId: candidate.groupId,
      scheduleId: candidate.scheduleId,
      sessionDate: candidate.sessionDate,
      scheduledStart: candidate.scheduledStart,
      scheduledEnd: candidate.scheduledEnd,
    })
    .onConflictDoNothing({
      target: [classSessions.groupId, classSessions.sessionDate, classSessions.scheduledStart],
    })
    .returning(sessionColumns);

  if (created) return created;

  const [existing] = await database
    .select(sessionColumns)
    .from(classSessions)
    .where(
      and(
        eq(classSessions.groupId, candidate.groupId),
        eq(classSessions.sessionDate, candidate.sessionDate),
        eq(classSessions.scheduledStart, candidate.scheduledStart),
      ),
    )
    .limit(1);

  if (!existing)
    throw new Error('La sesión concurrente no pudo recuperarse después del conflicto.');
  return existing;
}
