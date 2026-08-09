/**
 * Correcciones manuales y auditoría mínima (RN9).
 */

import {
  attendanceCorrections,
  attendances,
  classSessions,
  enrollments,
  getDatabase,
  students,
  users,
  type Database,
} from '@va/db';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AttendanceError } from './errors';

const identifier = z.uuid({ error: 'El identificador no es válido.' });
const instant = z.union([
  z.date(),
  z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
]);

export const attendanceCorrectionSchema = z.object({
  sessionId: identifier,
  studentId: identifier,
  userId: identifier,
  present: z.boolean(),
  checkedInAt: instant.optional(),
  reason: z.string().trim().min(1, 'El motivo es obligatorio.').max(500),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value || null),
});

export type AttendanceCorrectionInput = z.input<typeof attendanceCorrectionSchema>;

interface AttendanceSnapshot {
  id: string;
  checkedInAt: string;
  source: 'device' | 'manual';
  eventId: string | null;
  notes: string | null;
}

function snapshot(row: {
  id: string;
  checkedInAt: Date;
  source: 'device' | 'manual';
  eventId: string | null;
  notes: string | null;
}): AttendanceSnapshot {
  return { ...row, checkedInAt: row.checkedInAt.toISOString() };
}

export interface AttendanceCorrectionResult {
  correctionId: string;
  attendanceId: string | null;
  action: 'mark_present' | 'mark_absent' | 'update';
}

export async function correctAttendance(
  input: unknown,
  database: Database = getDatabase(),
  now: () => Date = () => new Date(),
): Promise<AttendanceCorrectionResult> {
  const parsed = attendanceCorrectionSchema.safeParse(input);
  if (!parsed.success) {
    throw new AttendanceError('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  }

  return database.transaction(async (tx) => {
    const [actor] = await tx
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1);
    if (!actor || actor.status !== 'active' || actor.role !== 'admin') {
      throw new AttendanceError(
        'forbidden',
        'Solo un administrador activo puede corregir asistencia.',
      );
    }

    const [session] = await tx
      .select({ id: classSessions.id, groupId: classSessions.groupId })
      .from(classSessions)
      .where(eq(classSessions.id, parsed.data.sessionId))
      .limit(1);
    if (!session) throw new AttendanceError('not_found', 'La sesión no existe.');

    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .innerJoin(
        enrollments,
        and(eq(enrollments.studentId, students.id), eq(enrollments.groupId, session.groupId)),
      )
      .where(eq(students.id, parsed.data.studentId))
      .limit(1);
    if (!student) {
      throw new AttendanceError('not_found', 'El estudiante no pertenece al grupo de la sesión.');
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${session.id}), hashtext(${student.id}))`,
    );

    const attendanceColumns = {
      id: attendances.id,
      checkedInAt: attendances.checkedInAt,
      source: attendances.source,
      eventId: attendances.eventId,
      notes: attendances.notes,
    } as const;
    const [existing] = await tx
      .select(attendanceColumns)
      .from(attendances)
      .where(and(eq(attendances.sessionId, session.id), eq(attendances.studentId, student.id)))
      .limit(1);

    const oldValue = existing ? snapshot(existing) : null;
    let action: AttendanceCorrectionResult['action'];
    let attendanceId: string | null;
    let newValue: AttendanceSnapshot | null;

    if (parsed.data.present) {
      const checkedInAt = parsed.data.checkedInAt ?? existing?.checkedInAt ?? now();
      const values = {
        checkedInAt,
        source: 'manual' as const,
        eventId: null,
        notes: parsed.data.notes,
        updatedAt: now(),
      };

      const [saved] = existing
        ? await tx
            .update(attendances)
            .set(values)
            .where(eq(attendances.id, existing.id))
            .returning(attendanceColumns)
        : await tx
            .insert(attendances)
            .values({ ...values, sessionId: session.id, studentId: student.id })
            .returning(attendanceColumns);

      if (!saved) throw new Error('No se pudo guardar la corrección de asistencia.');
      action = existing ? 'update' : 'mark_present';
      attendanceId = saved.id;
      newValue = snapshot(saved);
    } else {
      if (!existing) {
        throw new AttendanceError('conflict', 'El estudiante ya figura como ausente.');
      }
      await tx.delete(attendances).where(eq(attendances.id, existing.id));
      action = 'mark_absent';
      attendanceId = null;
      newValue = null;
    }

    const [correction] = await tx
      .insert(attendanceCorrections)
      .values({
        sessionId: session.id,
        studentId: student.id,
        attendanceId,
        userId: parsed.data.userId,
        action,
        oldValue,
        newValue,
        reason: parsed.data.reason,
      })
      .returning({ id: attendanceCorrections.id });

    if (!correction) throw new Error('No se pudo registrar la auditoría de la corrección.');
    return { correctionId: correction.id, attendanceId, action };
  });
}
