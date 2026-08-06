/**
 * Materias.
 *
 * `subjects` tiene `status` desde la migración inicial (`docs/data-model.md`), así que la baja es
 * un soft-delete como en el resto de entidades de dominio.
 */

import { subjects } from '@va/db';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';

import { resolveDatabase, type AcademicDatabase } from './database.js';
import { notFoundError, withTranslatedErrors } from './errors.js';
import { escapeLikePattern, identifier, parseInput, requiredText } from './validation.js';

/* -------------------------------------------------------------------------- */
/* Validación                                                                  */
/* -------------------------------------------------------------------------- */

export const SUBJECT_CODE_MAX_LENGTH = 32;
export const SUBJECT_NAME_MAX_LENGTH = 120;

const codeSchema = requiredText({
  missing: 'El código de la materia es obligatorio.',
  tooLong: `El código de la materia no puede superar los ${SUBJECT_CODE_MAX_LENGTH} caracteres.`,
  maxLength: SUBJECT_CODE_MAX_LENGTH,
})
  // Igual que en estudiantes: la cadena vacía ya la reporta el mensaje de «obligatorio».
  .refine((value) => value.length === 0 || /^[A-Za-z0-9-]+$/.test(value), {
    message: 'El código de la materia solo admite letras, dígitos y guiones.',
  })
  .transform((value) => value.toUpperCase());

export const subjectInputSchema = z.object({
  code: codeSchema,
  name: requiredText({
    missing: 'El nombre de la materia es obligatorio.',
    tooLong: `El nombre de la materia no puede superar los ${SUBJECT_NAME_MAX_LENGTH} caracteres.`,
    maxLength: SUBJECT_NAME_MAX_LENGTH,
  }),
});

export type SubjectInput = z.input<typeof subjectInputSchema>;

const subjectIdSchema = identifier('El identificador de la materia no es válido.');

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

export interface SubjectRow {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface ListSubjectsOptions {
  includeInactive?: boolean;
  search?: string;
}

const subjectColumns = {
  id: subjects.id,
  code: subjects.code,
  name: subjects.name,
  status: subjects.status,
} as const;

export async function listSubjects(
  options: ListSubjectsOptions = {},
  database?: AcademicDatabase,
): Promise<SubjectRow[]> {
  const search = options.search?.trim();
  const pattern = search ? `%${escapeLikePattern(search)}%` : undefined;

  const filters = [
    options.includeInactive === true ? undefined : eq(subjects.status, 'active'),
    pattern ? or(ilike(subjects.name, pattern), ilike(subjects.code, pattern)) : undefined,
  ].filter((filter) => filter !== undefined);

  return resolveDatabase(database)
    .select(subjectColumns)
    .from(subjects)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(subjects.code));
}

export async function getSubject(id: string, database?: AcademicDatabase): Promise<SubjectRow> {
  const subjectId = parseInput(subjectIdSchema, id);

  const [row] = await resolveDatabase(database)
    .select(subjectColumns)
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1);

  if (!row) throw notFoundError('La materia no existe.');
  return row;
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

export async function createSubject(
  input: unknown,
  database?: AcademicDatabase,
): Promise<SubjectRow> {
  const values = parseInput(subjectInputSchema, input);

  const [row] = await withTranslatedErrors(() =>
    resolveDatabase(database).insert(subjects).values(values).returning(subjectColumns),
  );

  if (!row) throw notFoundError('No se pudo crear la materia.');
  return row;
}

export async function updateSubject(
  id: string,
  input: unknown,
  database?: AcademicDatabase,
): Promise<SubjectRow> {
  const subjectId = parseInput(subjectIdSchema, id);
  const values = parseInput(subjectInputSchema, input);

  const [row] = await withTranslatedErrors(() =>
    resolveDatabase(database)
      .update(subjects)
      .set(values)
      .where(eq(subjects.id, subjectId))
      .returning(subjectColumns),
  );

  if (!row) throw notFoundError('La materia no existe.');
  return row;
}

/** Soft-delete: la fila se conserva, deja de aparecer en los listados. */
export async function setSubjectStatus(
  id: string,
  status: 'active' | 'inactive',
  database?: AcademicDatabase,
): Promise<SubjectRow> {
  const subjectId = parseInput(subjectIdSchema, id);

  const [row] = await resolveDatabase(database)
    .update(subjects)
    .set({ status })
    .where(eq(subjects.id, subjectId))
    .returning(subjectColumns);

  if (!row) throw notFoundError('La materia no existe.');
  return row;
}

export function deactivateSubject(id: string, database?: AcademicDatabase): Promise<SubjectRow> {
  return setSubjectStatus(id, 'inactive', database);
}

export function activateSubject(id: string, database?: AcademicDatabase): Promise<SubjectRow> {
  return setSubjectStatus(id, 'active', database);
}
