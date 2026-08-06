/**
 * Estudiantes.
 *
 * Minimización de datos (`docs/alcance-v2.md` §16): de un estudiante se guardan solo su nombre, su
 * código estudiantil y su estado. Nada más.
 *
 * El carnet se lee para mostrarlo, pero no se edita aquí: la asociación de carnets y el
 * enrolamiento por escaneo son de la lane W2 (`docs/agent-playbook.md` §4).
 */

import { cards, students } from '@va/db';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';

import { resolveDatabase, type AcademicDatabase } from './database';
import { notFoundError, withTranslatedErrors } from './errors';
import { escapeLikePattern, identifier, parseInput, requiredText } from './validation';

/* -------------------------------------------------------------------------- */
/* Validación                                                                  */
/* -------------------------------------------------------------------------- */

export const STUDENT_CODE_MAX_LENGTH = 32;
export const STUDENT_NAME_MAX_LENGTH = 120;

/** Código estudiantil: letras, dígitos y guiones. Se guarda en mayúsculas para que sea comparable. */
const studentCodeSchema = requiredText({
  missing: 'El código estudiantil es obligatorio.',
  tooLong: `El código estudiantil no puede superar los ${STUDENT_CODE_MAX_LENGTH} caracteres.`,
  maxLength: STUDENT_CODE_MAX_LENGTH,
})
  // La cadena vacía se deja pasar por este filtro a propósito: ya la señala el mensaje de
  // «obligatorio» y no tiene sentido acusar además de un formato inválido.
  .refine((value) => value.length === 0 || /^[A-Za-z0-9-]+$/.test(value), {
    message: 'El código estudiantil solo admite letras, dígitos y guiones.',
  })
  .transform((value) => value.toUpperCase());

const fullNameSchema = requiredText({
  missing: 'El nombre completo es obligatorio.',
  tooLong: `El nombre completo no puede superar los ${STUDENT_NAME_MAX_LENGTH} caracteres.`,
  maxLength: STUDENT_NAME_MAX_LENGTH,
});

export const studentInputSchema = z.object({
  studentCode: studentCodeSchema,
  fullName: fullNameSchema,
});

export type StudentInput = z.input<typeof studentInputSchema>;

const studentIdSchema = identifier('El identificador del estudiante no es válido.');

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

export interface StudentRow {
  id: string;
  studentCode: string;
  fullName: string;
  status: 'active' | 'inactive';
  /** UID del carnet activo, si tiene uno. Solo lectura: lo administra W2. */
  cardUid: string | null;
}

export interface ListStudentsOptions {
  /** Por defecto los listados solo muestran filas activas (soft-delete por `status`). */
  includeInactive?: boolean;
  /** Filtro por nombre o código, sin distinguir mayúsculas. */
  search?: string;
}

const studentColumns = {
  id: students.id,
  studentCode: students.studentCode,
  fullName: students.fullName,
  status: students.status,
  cardUid: cards.uid,
} as const;

export async function listStudents(
  options: ListStudentsOptions = {},
  database?: AcademicDatabase,
): Promise<StudentRow[]> {
  const search = options.search?.trim();
  const pattern = search ? `%${escapeLikePattern(search)}%` : undefined;

  const filters = [
    options.includeInactive === true ? undefined : eq(students.status, 'active'),
    pattern
      ? or(ilike(students.fullName, pattern), ilike(students.studentCode, pattern))
      : undefined,
  ].filter((filter) => filter !== undefined);

  return (
    resolveDatabase(database)
      .select(studentColumns)
      .from(students)
      // El carnet es opcional y solo se muestra el activo (`cards_uid_active_unique`).
      .leftJoin(cards, and(eq(cards.studentId, students.id), eq(cards.status, 'active')))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(students.fullName))
  );
}

/** Devuelve un estudiante por su id. @throws {DomainError} `not_found` si no existe. */
export async function getStudent(id: string, database?: AcademicDatabase): Promise<StudentRow> {
  const studentId = parseInput(studentIdSchema, id);

  const [row] = await resolveDatabase(database)
    .select(studentColumns)
    .from(students)
    .leftJoin(cards, and(eq(cards.studentId, students.id), eq(cards.status, 'active')))
    .where(eq(students.id, studentId))
    .limit(1);

  if (!row) throw notFoundError('El estudiante no existe.');
  return row;
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

export async function createStudent(
  input: unknown,
  database?: AcademicDatabase,
): Promise<StudentRow> {
  const values = parseInput(studentInputSchema, input);

  const [row] = await withTranslatedErrors(() =>
    resolveDatabase(database).insert(students).values(values).returning({
      id: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      status: students.status,
    }),
  );

  if (!row) throw notFoundError('No se pudo crear el estudiante.');
  // Un estudiante recién creado no tiene carnet: asociarlo es competencia de W2.
  return { ...row, cardUid: null };
}

export async function updateStudent(
  id: string,
  input: unknown,
  database?: AcademicDatabase,
): Promise<StudentRow> {
  const studentId = parseInput(studentIdSchema, id);
  const values = parseInput(studentInputSchema, input);

  const [row] = await withTranslatedErrors(() =>
    resolveDatabase(database)
      .update(students)
      .set(values)
      .where(eq(students.id, studentId))
      .returning({ id: students.id }),
  );

  if (!row) throw notFoundError('El estudiante no existe.');
  return getStudent(row.id, database);
}

/**
 * Cambia el estado del estudiante. Dar de baja NUNCA borra la fila: solo la saca de los listados
 * (soft-delete por `status`, `docs/data-model.md`).
 */
export async function setStudentStatus(
  id: string,
  status: 'active' | 'inactive',
  database?: AcademicDatabase,
): Promise<StudentRow> {
  const studentId = parseInput(studentIdSchema, id);

  const [row] = await resolveDatabase(database)
    .update(students)
    .set({ status })
    .where(eq(students.id, studentId))
    .returning({ id: students.id });

  if (!row) throw notFoundError('El estudiante no existe.');
  return getStudent(row.id, database);
}

export function deactivateStudent(id: string, database?: AcademicDatabase): Promise<StudentRow> {
  return setStudentStatus(id, 'inactive', database);
}

export function activateStudent(id: string, database?: AcademicDatabase): Promise<StudentRow> {
  return setStudentStatus(id, 'active', database);
}
