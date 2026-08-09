/**
 * Modelos de lectura para la UI de asistencia. Toda consulta Drizzle queda del lado servidor.
 */

import {
  attendanceCorrections,
  attendances,
  cards,
  classSessions,
  devices,
  enrollments,
  getDatabase,
  groups,
  rfidEvents,
  students,
  subjects,
  type Database,
} from '@va/db';
import { and, desc, eq } from 'drizzle-orm';

import { AttendanceError } from './errors';

export interface SessionListItem {
  id: string;
  sessionDate: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  groupId: string;
  groupName: string;
  subjectCode: string;
  subjectName: string;
}

export async function listClassSessions(
  options: { teacherId?: string; limit?: number } = {},
  database: Database = getDatabase(),
): Promise<SessionListItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const teacherFilter = options.teacherId ? eq(groups.teacherId, options.teacherId) : undefined;

  return database
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      scheduledStart: classSessions.scheduledStart,
      scheduledEnd: classSessions.scheduledEnd,
      groupId: groups.id,
      groupName: groups.name,
      subjectCode: subjects.code,
      subjectName: subjects.name,
    })
    .from(classSessions)
    .innerJoin(groups, eq(groups.id, classSessions.groupId))
    .innerJoin(subjects, eq(subjects.id, groups.subjectId))
    .where(teacherFilter)
    .orderBy(desc(classSessions.scheduledStart))
    .limit(limit);
}

export interface SessionRosterStudent {
  id: string;
  studentCode: string;
  fullName: string;
  present: boolean;
  checkedInAt: Date | null;
  minutesFromStart: number | null;
  source: 'device' | 'manual' | null;
  notes: string | null;
}

export interface SessionRoster {
  session: SessionListItem;
  students: SessionRosterStudent[];
}

/** Ausente se calcula como inscripción activa sin fila de asistencia (RN5). */
export async function getSessionRoster(
  sessionId: string,
  database: Database = getDatabase(),
): Promise<SessionRoster> {
  const [session] = await database
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      scheduledStart: classSessions.scheduledStart,
      scheduledEnd: classSessions.scheduledEnd,
      groupId: groups.id,
      groupName: groups.name,
      subjectCode: subjects.code,
      subjectName: subjects.name,
    })
    .from(classSessions)
    .innerJoin(groups, eq(groups.id, classSessions.groupId))
    .innerJoin(subjects, eq(subjects.id, groups.subjectId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  if (!session) throw new AttendanceError('not_found', 'La sesión no existe.');

  const rows = await database
    .select({
      id: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      checkedInAt: attendances.checkedInAt,
      source: attendances.source,
      notes: attendances.notes,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .leftJoin(
      attendances,
      and(eq(attendances.sessionId, session.id), eq(attendances.studentId, students.id)),
    )
    .where(and(eq(enrollments.groupId, session.groupId), eq(enrollments.status, 'active')))
    .orderBy(students.fullName);

  return {
    session,
    students: rows.map((row) => ({
      ...row,
      present: row.checkedInAt !== null,
      minutesFromStart:
        row.checkedInAt === null
          ? null
          : Math.floor((row.checkedInAt.getTime() - session.scheduledStart.getTime()) / 60_000),
    })),
  };
}

export interface StudentAttendanceHistoryItem extends SessionListItem {
  attendanceId: string;
  checkedInAt: Date;
  source: 'device' | 'manual';
  notes: string | null;
}

export async function listStudentAttendanceHistory(
  studentId: string,
  database: Database = getDatabase(),
): Promise<StudentAttendanceHistoryItem[]> {
  return database
    .select({
      attendanceId: attendances.id,
      checkedInAt: attendances.checkedInAt,
      source: attendances.source,
      notes: attendances.notes,
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      scheduledStart: classSessions.scheduledStart,
      scheduledEnd: classSessions.scheduledEnd,
      groupId: groups.id,
      groupName: groups.name,
      subjectCode: subjects.code,
      subjectName: subjects.name,
    })
    .from(attendances)
    .innerJoin(classSessions, eq(classSessions.id, attendances.sessionId))
    .innerJoin(groups, eq(groups.id, classSessions.groupId))
    .innerJoin(subjects, eq(subjects.id, groups.subjectId))
    .where(eq(attendances.studentId, studentId))
    .orderBy(desc(classSessions.scheduledStart));
}

export async function listSessionCorrections(
  sessionId: string,
  database: Database = getDatabase(),
) {
  return database
    .select({
      id: attendanceCorrections.id,
      studentId: attendanceCorrections.studentId,
      studentCode: students.studentCode,
      studentName: students.fullName,
      userId: attendanceCorrections.userId,
      action: attendanceCorrections.action,
      oldValue: attendanceCorrections.oldValue,
      newValue: attendanceCorrections.newValue,
      reason: attendanceCorrections.reason,
      createdAt: attendanceCorrections.createdAt,
    })
    .from(attendanceCorrections)
    .innerJoin(students, eq(students.id, attendanceCorrections.studentId))
    .where(eq(attendanceCorrections.sessionId, sessionId))
    .orderBy(desc(attendanceCorrections.createdAt));
}

export async function listRfidEventLog(
  options: { limit?: number } = {},
  database: Database = getDatabase(),
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  return database
    .select({
      id: rfidEvents.id,
      eventId: rfidEvents.eventId,
      receivedAt: rfidEvents.receivedAt,
      scannedAt: rfidEvents.scannedAt,
      result: rfidEvents.result,
      cardUid: rfidEvents.cardUid,
      deviceName: devices.name,
      studentCode: students.studentCode,
      studentName: students.fullName,
    })
    .from(rfidEvents)
    .innerJoin(devices, eq(devices.id, rfidEvents.deviceId))
    .leftJoin(cards, eq(cards.id, rfidEvents.cardId))
    .leftJoin(students, eq(students.id, cards.studentId))
    .orderBy(desc(rfidEvents.receivedAt))
    .limit(limit);
}
