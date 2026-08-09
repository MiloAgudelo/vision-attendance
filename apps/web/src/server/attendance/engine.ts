/**
 * Motor de asistencia conectado al pipeline de eventos (RN2, RN3, RN6, RN8 y RN10).
 */

import { attendances } from '@va/db';
import { and, eq, sql } from 'drizzle-orm';

import type { AttendanceEngine } from '../events/attendance-engine';
import { findSessionCandidate, getOrCreateClassSession } from '../sessions/session-engine';

export const attendanceEngine: AttendanceEngine = async (context) => {
  const candidate = await findSessionCandidate(context.tx, {
    studentId: context.student.id,
    deviceRoom: context.device.room,
    receivedAt: context.receivedAt,
  });

  if (!candidate) return { result: 'no_session', session: null };

  const session = await getOrCreateClassSession(context.tx, candidate);
  const responseSession = {
    id: session.id,
    scheduledStart: session.scheduledStart.toISOString(),
  };

  // El flujo normativo crea/confirma la sesión antes de verificar la inscripción.
  if (!candidate.enrolled) {
    return { result: 'not_enrolled', session: responseSession };
  }

  // El UNIQUE garantiza la fila; el lock hace que la respuesta concurrente también sea correcta:
  // el segundo evento espera el COMMIT del primero y ya puede responder `already_registered`.
  await context.tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${session.id}), hashtext(${context.student.id}))`,
  );

  const [existing] = await context.tx
    .select({ id: attendances.id })
    .from(attendances)
    .where(
      and(eq(attendances.sessionId, session.id), eq(attendances.studentId, context.student.id)),
    )
    .limit(1);

  if (existing) return { result: 'already_registered', session: responseSession };

  return {
    result: 'registered',
    session: responseSession,
    persist: async (database) => {
      // Idempotente por RN6. En la ejecución normal el advisory lock hace que este INSERT gane una
      // sola vez; ON CONFLICT mantiene segura una repetición de infraestructura.
      await database
        .insert(attendances)
        .values({
          sessionId: session.id,
          studentId: context.student.id,
          checkedInAt: context.receivedAt,
          source: 'device',
          eventId: context.eventRowId,
        })
        .onConflictDoNothing({
          target: [attendances.sessionId, attendances.studentId],
        });
    },
  };
};
