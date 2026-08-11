/**
 * Autorización de lectura para sesiones e historial. Teacher solo ve sus grupos.
 */

import { notFound } from 'next/navigation';

import type { ApplicationUser } from '@/app/_lib/auth/current-user';
import { AttendanceError } from '@/server/attendance/errors';
import {
  getSessionRoster,
  listClassSessions,
  listStudentAttendanceHistory,
  type SessionRoster,
  type StudentAttendanceHistoryItem,
} from '@/server/attendance/queries';

async function teacherGroupIds(teacherId: string): Promise<Set<string>> {
  const sessions = await listClassSessions({ teacherId, limit: 200 });
  return new Set(sessions.map((session) => session.groupId));
}

/** Roster de una sesión visible para el usuario, o 404 si no existe o no le pertenece. */
export async function loadAccessibleSessionRoster(
  sessionId: string,
  user: ApplicationUser,
): Promise<SessionRoster> {
  let roster: SessionRoster;
  try {
    roster = await getSessionRoster(sessionId);
  } catch (error) {
    if (error instanceof AttendanceError && error.code === 'not_found') notFound();
    throw error;
  }

  if (user.role === 'admin') return roster;

  const groupIds = await teacherGroupIds(user.id);
  if (!groupIds.has(roster.session.groupId)) notFound();
  return roster;
}

/** Sesiones visibles: todas para admin, solo las del profesor asignado para teacher. */
export async function listAccessibleSessions(user: ApplicationUser) {
  if (user.role === 'admin') return listClassSessions({ limit: 100 });
  return listClassSessions({ teacherId: user.id, limit: 100 });
}

/**
 * Historial por estudiante filtrado al alcance del usuario.
 * El profesor solo consulta estudiantes de sus grupos.
 */
export async function loadAccessibleStudentHistory(
  studentId: string,
  user: ApplicationUser,
): Promise<StudentAttendanceHistoryItem[]> {
  const history = await listStudentAttendanceHistory(studentId);

  if (user.role === 'admin') return history;

  const groupIds = await teacherGroupIds(user.id);
  const visible = history.filter((item) => groupIds.has(item.groupId));

  if (visible.length > 0) return visible;

  const sessions = await listClassSessions({ teacherId: user.id, limit: 50 });
  for (const session of sessions) {
    const roster = await getSessionRoster(session.id);
    if (roster.students.some((student) => student.id === studentId)) {
      return visible;
    }
  }

  notFound();
}
