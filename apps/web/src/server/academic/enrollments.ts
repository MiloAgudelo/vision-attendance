/**
 * Inscripciones de estudiantes en un grupo.
 *
 * No son una sección propia de la interfaz: se gestionan dentro de la pantalla del grupo
 * (`docs/agent-playbook.md` §4, W1).
 *
 * Unicidad `UNIQUE(group_id, student_id)`: un estudiante no puede tener dos inscripciones en el
 * mismo grupo ni siquiera después de retirarlo. Por eso volver a inscribir a alguien retirado
 * reactiva su fila en lugar de insertar otra.
 */

import { enrollments, students } from '@va/db';
import { and, asc, eq, notExists } from 'drizzle-orm';
import { z } from 'zod';

import { resolveDatabase, type AcademicDatabase } from './database.js';
import { conflictError, notFoundError, withTranslatedErrors } from './errors.js';
import { identifier, parseInput } from './validation.js';

/* -------------------------------------------------------------------------- */
/* Validación                                                                  */
/* -------------------------------------------------------------------------- */

export const enrollmentInputSchema = z.object({
  groupId: identifier('El grupo indicado no es válido.'),
  studentId: identifier('Selecciona un estudiante válido.'),
});

export type EnrollmentInput = z.input<typeof enrollmentInputSchema>;

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

export interface EnrollmentRow {
  id: string;
  groupId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentStatus: 'active' | 'inactive';
  status: 'active' | 'inactive';
}

const enrollmentColumns = {
  id: enrollments.id,
  groupId: enrollments.groupId,
  studentId: enrollments.studentId,
  studentCode: students.studentCode,
  studentName: students.fullName,
  studentStatus: students.status,
  status: enrollments.status,
} as const;

export interface ListEnrollmentsOptions {
  /** Incluye también a quienes fueron retirados del grupo. */
  includeInactive?: boolean;
}

export async function listEnrollments(
  groupId: string,
  options: ListEnrollmentsOptions = {},
  database?: AcademicDatabase,
): Promise<EnrollmentRow[]> {
  const id = parseInput(identifier('El grupo indicado no es válido.'), groupId);

  const filters = [
    eq(enrollments.groupId, id),
    options.includeInactive === true ? undefined : eq(enrollments.status, 'active'),
  ].filter((filter) => filter !== undefined);

  return resolveDatabase(database)
    .select(enrollmentColumns)
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(...filters))
    .orderBy(asc(students.fullName));
}

/** Estudiantes activos que todavía no están inscritos (activos) en el grupo. */
export async function listEnrollableStudents(
  groupId: string,
  database?: AcademicDatabase,
): Promise<{ id: string; studentCode: string; fullName: string }[]> {
  const id = parseInput(identifier('El grupo indicado no es válido.'), groupId);
  const database_ = resolveDatabase(database);

  return database_
    .select({
      id: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
    })
    .from(students)
    .where(
      and(
        eq(students.status, 'active'),
        notExists(
          database_
            .select({ one: enrollments.id })
            .from(enrollments)
            .where(
              and(
                eq(enrollments.groupId, id),
                eq(enrollments.studentId, students.id),
                eq(enrollments.status, 'active'),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(students.fullName));
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Inscribe un estudiante en un grupo.
 *
 * - Si ya está inscrito y activo → error de negocio (no un 500 por `unique_violation`).
 * - Si estuvo inscrito y fue retirado → se reactiva su misma fila, respetando la unicidad.
 *
 * @throws {DomainError} `conflict` si ya estaba inscrito; `validation` si el estudiante está de baja.
 */
export async function enrollStudent(
  input: unknown,
  database?: AcademicDatabase,
): Promise<EnrollmentRow> {
  const { groupId, studentId } = parseInput(enrollmentInputSchema, input);
  const database_ = resolveDatabase(database);

  const [student] = await database_
    .select({ status: students.status })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  if (!student) throw notFoundError('El estudiante no existe.');
  if (student.status !== 'active') {
    throw conflictError('No se puede inscribir a un estudiante dado de baja.', 'studentId');
  }

  const [existing] = await database_
    .select({ id: enrollments.id, status: enrollments.status })
    .from(enrollments)
    .where(and(eq(enrollments.groupId, groupId), eq(enrollments.studentId, studentId)))
    .limit(1);

  if (existing?.status === 'active') {
    throw conflictError('El estudiante ya está inscrito en este grupo.', 'studentId');
  }

  const [row] = existing
    ? await database_
        .update(enrollments)
        .set({ status: 'active' })
        .where(eq(enrollments.id, existing.id))
        .returning({ id: enrollments.id })
    : // La restricción sigue siendo la última palabra: dos altas simultáneas del mismo estudiante
      // pasan las comprobaciones de arriba y una de las dos choca aquí (traducida a `conflict`).
      await withTranslatedErrors(() =>
        database_.insert(enrollments).values({ groupId, studentId }).returning({
          id: enrollments.id,
        }),
      );

  if (!row) throw notFoundError('No se pudo inscribir al estudiante.');
  return getEnrollment(row.id, database_);
}

/** Retira a un estudiante del grupo. Soft-delete: la fila se conserva con `status = 'inactive'`. */
export async function withdrawStudent(
  input: unknown,
  database?: AcademicDatabase,
): Promise<EnrollmentRow> {
  const { groupId, studentId } = parseInput(enrollmentInputSchema, input);

  const [row] = await resolveDatabase(database)
    .update(enrollments)
    .set({ status: 'inactive' })
    .where(and(eq(enrollments.groupId, groupId), eq(enrollments.studentId, studentId)))
    .returning({ id: enrollments.id });

  if (!row) throw notFoundError('El estudiante no está inscrito en este grupo.');
  return getEnrollment(row.id, database);
}

export async function getEnrollment(
  id: string,
  database?: AcademicDatabase,
): Promise<EnrollmentRow> {
  const enrollmentId = parseInput(identifier('La inscripción indicada no es válida.'), id);

  const [row] = await resolveDatabase(database)
    .select(enrollmentColumns)
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);

  if (!row) throw notFoundError('La inscripción no existe.');
  return row;
}
