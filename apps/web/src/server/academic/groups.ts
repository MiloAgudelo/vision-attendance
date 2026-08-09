/**
 * Grupos.
 *
 * RN2: `session_window_minutes` es la ventana —en minutos antes de la hora programada de inicio—
 * en la que un escaneo ya cuenta para la sesión. Es configurable **por grupo** y su valor por
 * defecto es 60. Quien la aplica al recibir un evento es la lane W4; aquí solo se administra.
 *
 * Unicidad: `UNIQUE(subject_id, name, term)`; la violación se traduce a un mensaje de negocio.
 */

import { enrollments, groups, schedules, subjects, users } from '@va/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { resolveDatabase, type AcademicDatabase } from './database';
import { notFoundError, withTranslatedErrors } from './errors';
import { identifier, parseInput, requiredText } from './validation';

/* -------------------------------------------------------------------------- */
/* Validación                                                                  */
/* -------------------------------------------------------------------------- */

export const GROUP_NAME_MAX_LENGTH = 40;
export const GROUP_TERM_MAX_LENGTH = 20;

/** RN2 y `docs/alcance-v2.md` §17.3: la ventana por defecto es de 60 minutos. */
export const DEFAULT_SESSION_WINDOW_MINUTES = 60;
/** Tope defensivo: media jornada. Una ventana mayor haría que cualquier escaneo cayera en clase. */
export const MAX_SESSION_WINDOW_MINUTES = 720;

const optionalSessionWindowSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
      ? undefined
      : value,
  z.coerce
    .number({ error: 'La ventana de sesión debe ser un número de minutos.' })
    .int('La ventana de sesión debe ser un número entero de minutos.')
    .min(0, 'La ventana de sesión no puede ser negativa.')
    .max(
      MAX_SESSION_WINDOW_MINUTES,
      `La ventana de sesión no puede superar los ${MAX_SESSION_WINDOW_MINUTES} minutos.`,
    )
    .optional(),
);

const groupBaseInputSchema = z.object({
  subjectId: identifier('Selecciona una materia válida.'),
  name: requiredText({
    missing: 'El nombre del grupo es obligatorio.',
    tooLong: `El nombre del grupo no puede superar los ${GROUP_NAME_MAX_LENGTH} caracteres.`,
    maxLength: GROUP_NAME_MAX_LENGTH,
  }),
  term: requiredText({
    missing: 'El periodo académico es obligatorio.',
    tooLong: `El periodo académico no puede superar los ${GROUP_TERM_MAX_LENGTH} caracteres.`,
    maxLength: GROUP_TERM_MAX_LENGTH,
  }),
  teacherId: identifier('El profesor seleccionado no es válido.')
    .nullish()
    .transform((value) => value ?? null),
});

export const groupInputSchema = groupBaseInputSchema.extend({
  sessionWindowMinutes: optionalSessionWindowSchema.transform(
    (value) => value ?? DEFAULT_SESSION_WINDOW_MINUTES,
  ),
});

export const groupUpdateInputSchema = groupBaseInputSchema.extend({
  sessionWindowMinutes: optionalSessionWindowSchema,
}).transform((values) => {
  const { sessionWindowMinutes, ...unchanged } = values;
  return sessionWindowMinutes === undefined ? unchanged : values;
});

export type GroupInput = z.input<typeof groupInputSchema>;

const groupIdSchema = identifier('El identificador del grupo no es válido.');

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

export interface GroupRow {
  id: string;
  name: string;
  term: string;
  sessionWindowMinutes: number;
  status: 'active' | 'inactive';
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
}

export interface GroupListItem extends GroupRow {
  /** Inscripciones activas del grupo. */
  enrolledCount: number;
  /** Franjas del horario semanal del grupo. */
  scheduleCount: number;
}

export interface ListGroupsOptions {
  includeInactive?: boolean;
  subjectId?: string;
}

const groupColumns = {
  id: groups.id,
  name: groups.name,
  term: groups.term,
  sessionWindowMinutes: groups.sessionWindowMinutes,
  status: groups.status,
  subjectId: subjects.id,
  subjectCode: subjects.code,
  subjectName: subjects.name,
  teacherId: users.id,
  teacherName: users.fullName,
} as const;

/** Subconsultas de conteo: evitan traer todas las filas hijas solo para contarlas. */
const countColumns = {
  enrolledCount: sql<number>`(
    select count(*) from ${enrollments}
    where ${enrollments.groupId} = ${groups.id} and ${enrollments.status} = 'active'
  )`.mapWith(Number),
  scheduleCount: sql<number>`(
    select count(*) from ${schedules} where ${schedules.groupId} = ${groups.id}
  )`.mapWith(Number),
} as const;

export async function listGroups(
  options: ListGroupsOptions = {},
  database?: AcademicDatabase,
): Promise<GroupListItem[]> {
  const filters = [
    options.includeInactive === true ? undefined : eq(groups.status, 'active'),
    options.subjectId ? eq(groups.subjectId, options.subjectId) : undefined,
  ].filter((filter) => filter !== undefined);

  return resolveDatabase(database)
    .select({ ...groupColumns, ...countColumns })
    .from(groups)
    .innerJoin(subjects, eq(subjects.id, groups.subjectId))
    .leftJoin(users, eq(users.id, groups.teacherId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(subjects.code), asc(groups.term), asc(groups.name));
}

export async function getGroup(id: string, database?: AcademicDatabase): Promise<GroupRow> {
  const groupId = parseInput(groupIdSchema, id);

  const [row] = await resolveDatabase(database)
    .select(groupColumns)
    .from(groups)
    .innerJoin(subjects, eq(subjects.id, groups.subjectId))
    .leftJoin(users, eq(users.id, groups.teacherId))
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!row) throw notFoundError('El grupo no existe.');
  return row;
}

/**
 * Profesores disponibles para asignar a un grupo.
 *
 * Lectura de solo consulta sobre `users`: las cuentas y los roles los administra la lane W5.
 */
export async function listTeachers(
  database?: AcademicDatabase,
): Promise<{ id: string; fullName: string }[]> {
  return resolveDatabase(database)
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.role, 'teacher'), eq(users.status, 'active')))
    .orderBy(asc(users.fullName));
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

export async function createGroup(input: unknown, database?: AcademicDatabase): Promise<GroupRow> {
  const values = parseInput(groupInputSchema, input);

  const [row] = await withTranslatedErrors(() =>
    resolveDatabase(database).insert(groups).values(values).returning({ id: groups.id }),
  );

  if (!row) throw notFoundError('No se pudo crear el grupo.');
  return getGroup(row.id, database);
}

export async function updateGroup(
  id: string,
  input: unknown,
  database?: AcademicDatabase,
): Promise<GroupRow> {
  const groupId = parseInput(groupIdSchema, id);
  const values = parseInput(groupUpdateInputSchema, input);

  const [row] = await withTranslatedErrors(() =>
    resolveDatabase(database)
      .update(groups)
      .set(values)
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id }),
  );

  if (!row) throw notFoundError('El grupo no existe.');
  return getGroup(row.id, database);
}

/** Soft-delete: la fila se conserva con sus inscripciones y su horario. */
export async function setGroupStatus(
  id: string,
  status: 'active' | 'inactive',
  database?: AcademicDatabase,
): Promise<GroupRow> {
  const groupId = parseInput(groupIdSchema, id);

  const [row] = await resolveDatabase(database)
    .update(groups)
    .set({ status })
    .where(eq(groups.id, groupId))
    .returning({ id: groups.id });

  if (!row) throw notFoundError('El grupo no existe.');
  return getGroup(row.id, database);
}

export function deactivateGroup(id: string, database?: AcademicDatabase): Promise<GroupRow> {
  return setGroupStatus(id, 'inactive', database);
}

export function activateGroup(id: string, database?: AcademicDatabase): Promise<GroupRow> {
  return setGroupStatus(id, 'active', database);
}
