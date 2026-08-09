/**
 * Horario semanal de un grupo.
 *
 * RN10: las franjas se definen en hora local `America/Bogota` y se guardan como `time`, tal cual.
 * **Aquí no se convierte nada a UTC**: quien calcula los instantes de una sesión concreta a partir
 * de la fecha, el horario y la zona horaria es la lane W4.
 *
 * `schedules` es la única entidad de este subárbol sin columna `status`
 * (`packages/db/src/schema.ts`), así que retirar una franja sí borra la fila. Es seguro: la clave
 * foránea `class_sessions.schedule_id` está declarada `ON DELETE set null`, de modo que las
 * sesiones ya creadas conservan su historia aunque su franja desaparezca.
 */

import { groups, schedules, subjects } from '@va/db';
import { and, asc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { resolveDatabase, type AcademicDatabase } from './database';
import { conflictError, notFoundError, withTranslatedErrors } from './errors';
import { identifier, optionalText, parseInput } from './validation';

/* -------------------------------------------------------------------------- */
/* Días de la semana (ISO-8601)                                                */
/* -------------------------------------------------------------------------- */

/** Día ISO-8601: 1 = lunes … 7 = domingo, igual que el CHECK `schedules_weekday_range`. */
export const WEEKDAYS = [
  { iso: 1, label: 'Lunes' },
  { iso: 2, label: 'Martes' },
  { iso: 3, label: 'Miércoles' },
  { iso: 4, label: 'Jueves' },
  { iso: 5, label: 'Viernes' },
  { iso: 6, label: 'Sábado' },
  { iso: 7, label: 'Domingo' },
] as const;

/** Nombre en español de un día ISO; devuelve el número si recibe algo fuera de rango. */
export function weekdayLabel(iso: number): string {
  return WEEKDAYS.find((day) => day.iso === iso)?.label ?? String(iso);
}

/* -------------------------------------------------------------------------- */
/* Validación                                                                  */
/* -------------------------------------------------------------------------- */

export const ROOM_MAX_LENGTH = 60;

/** `HH:MM` o `HH:MM:SS` en reloj de 24 horas. */
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** Normaliza una hora local a `HH:MM:SS`, el formato con el que la lee y escribe Postgres. */
export function normalizeTimeOfDay(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

const timeSchema = (missing: string, invalid: string) =>
  z
    .string({ error: missing })
    .trim()
    .min(1, missing)
    // La cadena vacía la reporta `.min(1)`; no se acumula además un error de formato.
    .refine((value) => value.length === 0 || TIME_OF_DAY.test(value), { message: invalid })
    .transform(normalizeTimeOfDay);

const weekdaySchema = z.coerce
  .number({ error: 'Selecciona un día de la semana.' })
  .int('El día de la semana debe estar entre 1 (lunes) y 7 (domingo).')
  .min(1, 'El día de la semana debe estar entre 1 (lunes) y 7 (domingo).')
  .max(7, 'El día de la semana debe estar entre 1 (lunes) y 7 (domingo).');

export const scheduleInputSchema = z
  .object({
    groupId: identifier('El grupo indicado no es válido.'),
    weekday: weekdaySchema,
    startTime: timeSchema(
      'La hora de inicio es obligatoria.',
      'La hora de inicio debe tener el formato HH:MM.',
    ),
    endTime: timeSchema(
      'La hora de fin es obligatoria.',
      'La hora de fin debe tener el formato HH:MM.',
    ),
    room: optionalText({
      tooLong: `El salón no puede superar los ${ROOM_MAX_LENGTH} caracteres.`,
      maxLength: ROOM_MAX_LENGTH,
    }),
  })
  // Mismo criterio que el CHECK `schedules_time_order`, comprobado antes de tocar la base para
  // poder señalar el campo culpable en el formulario.
  .superRefine((value, context) => {
    if (
      TIME_OF_DAY.test(value.startTime) &&
      TIME_OF_DAY.test(value.endTime) &&
      value.endTime <= value.startTime
    ) {
      context.addIssue({
        code: 'custom',
        message: 'La hora de fin debe ser posterior a la hora de inicio.',
        path: ['endTime'],
      });
    }
  });

export type ScheduleInput = z.input<typeof scheduleInputSchema>;

const scheduleIdSchema = identifier('El identificador de la franja no es válido.');

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

export interface ScheduleRow {
  id: string;
  groupId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
}

/** Franja con el grupo y la materia a los que pertenece, para el horario semanal consolidado. */
export interface WeeklyScheduleRow extends ScheduleRow {
  groupName: string;
  groupTerm: string;
  subjectCode: string;
  subjectName: string;
}

const scheduleColumns = {
  id: schedules.id,
  groupId: schedules.groupId,
  weekday: schedules.weekday,
  startTime: schedules.startTime,
  endTime: schedules.endTime,
  room: schedules.room,
} as const;

export async function listSchedulesByGroup(
  groupId: string,
  database?: AcademicDatabase,
): Promise<ScheduleRow[]> {
  const id = parseInput(identifier('El grupo indicado no es válido.'), groupId);

  return resolveDatabase(database)
    .select(scheduleColumns)
    .from(schedules)
    .where(eq(schedules.groupId, id))
    .orderBy(asc(schedules.weekday), asc(schedules.startTime));
}

export interface WeeklyScheduleOptions {
  includeInactiveGroups?: boolean;
}

/** Horario semanal de todos los grupos: la vista de consulta de la sección «Horarios». */
export async function listWeeklySchedule(
  options: WeeklyScheduleOptions = {},
  database?: AcademicDatabase,
): Promise<WeeklyScheduleRow[]> {
  const filters = [
    options.includeInactiveGroups === true ? undefined : eq(groups.status, 'active'),
  ].filter((filter) => filter !== undefined);

  return resolveDatabase(database)
    .select({
      ...scheduleColumns,
      groupName: groups.name,
      groupTerm: groups.term,
      subjectCode: subjects.code,
      subjectName: subjects.name,
    })
    .from(schedules)
    .innerJoin(groups, eq(groups.id, schedules.groupId))
    .innerJoin(subjects, eq(subjects.id, groups.subjectId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(schedules.weekday), asc(schedules.startTime), asc(subjects.code));
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

const OVERLAPPING_SCHEDULE_MESSAGE =
  'La franja se solapa con otro horario del grupo en el mismo día.';

type ScheduleTransaction = Pick<AcademicDatabase, 'execute' | 'select'>;

async function ensureScheduleDoesNotOverlap(
  values: z.output<typeof scheduleInputSchema>,
  database: ScheduleTransaction,
  excludedScheduleId?: string,
): Promise<void> {
  const filters = [
    eq(schedules.groupId, values.groupId),
    eq(schedules.weekday, values.weekday),
    lt(schedules.startTime, values.endTime),
    gt(schedules.endTime, values.startTime),
    excludedScheduleId ? ne(schedules.id, excludedScheduleId) : undefined,
  ].filter((filter) => filter !== undefined);

  const [overlap] = await database
    .select({ id: schedules.id })
    .from(schedules)
    .where(and(...filters))
    .limit(1);

  if (overlap) throw conflictError(OVERLAPPING_SCHEDULE_MESSAGE, 'startTime');
}

async function lockGroupSchedule(groupId: string, database: ScheduleTransaction): Promise<void> {
  // Serializa altas/ediciones del mismo grupo para que un doble clic no supere la comprobación.
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtext('vision-attendance:schedules'), hashtext(${groupId}))`,
  );
}

export async function addSchedule(
  input: unknown,
  database?: AcademicDatabase,
): Promise<ScheduleRow> {
  const values = parseInput(scheduleInputSchema, input);
  const database_ = resolveDatabase(database);

  const row = await withTranslatedErrors(() =>
    database_.transaction(async (tx) => {
      await lockGroupSchedule(values.groupId, tx);
      await ensureScheduleDoesNotOverlap(values, tx);
      const [created] = await tx.insert(schedules).values(values).returning(scheduleColumns);
      return created;
    }),
  );

  if (!row) throw notFoundError('No se pudo crear la franja del horario.');
  return row;
}

export async function updateSchedule(
  id: string,
  input: unknown,
  database?: AcademicDatabase,
): Promise<ScheduleRow> {
  const scheduleId = parseInput(scheduleIdSchema, id);
  const values = parseInput(scheduleInputSchema, input);
  const database_ = resolveDatabase(database);

  const row = await withTranslatedErrors(() =>
    database_.transaction(async (tx) => {
      await lockGroupSchedule(values.groupId, tx);
      await ensureScheduleDoesNotOverlap(values, tx, scheduleId);
      const [updated] = await tx
        .update(schedules)
        .set(values)
        .where(eq(schedules.id, scheduleId))
        .returning(scheduleColumns);
      return updated;
    }),
  );

  if (!row) throw notFoundError('La franja del horario no existe.');
  return row;
}

/**
 * Elimina una franja del horario.
 *
 * Es un borrado real —`schedules` no tiene `status`— y por eso solo afecta al horario futuro: las
 * sesiones ya creadas apuntan a la franja con `ON DELETE set null` y no se pierden.
 */
export async function removeSchedule(
  id: string,
  database?: AcademicDatabase,
): Promise<ScheduleRow> {
  const scheduleId = parseInput(scheduleIdSchema, id);

  const [row] = await withTranslatedErrors(() =>
    resolveDatabase(database)
      .delete(schedules)
      .where(eq(schedules.id, scheduleId))
      .returning(scheduleColumns),
  );

  if (!row) throw notFoundError('La franja del horario no existe.');
  return row;
}
