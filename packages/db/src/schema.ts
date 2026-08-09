/**
 * Esquema físico completo del MVP.
 *
 * Implementación literal de `docs/data-model.md`: nombres en inglés `snake_case`, ids `uuid` con
 * `gen_random_uuid()`, timestamps `timestamptz` en UTC. Este archivo es la fuente de verdad del
 * modelo y tiene propietario único (ver `docs/agent-playbook.md` §3): después de la fase de
 * fundaciones solo la lane W4 puede modificarlo, y siempre con una migración nueva.
 *
 * Eliminación: soft-delete por `status` en las entidades de dominio. `rfid_events` y
 * `attendance_corrections` son inmutables (nunca UPDATE de negocio ni DELETE); por eso las claves
 * foráneas que apuntan a ellas o desde ellas usan el comportamiento restrictivo por defecto.
 */

import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type {
  AttendanceSource,
  CardStatus,
  CorrectionAction,
  DeviceMode,
  DeviceStatus,
  EventResult,
  RecordStatus,
  UserRole,
} from '@va/shared';

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Falla la compilación si los valores declarados aquí y la unión equivalente de `@va/shared`
 * dejan de coincidir exactamente. `@va/db` importa `@va/shared` **solo como tipos**
 * (`docs/architecture.md` §2), así que la alineación se comprueba en tiempo de compilación en
 * vez de compartir el arreglo en tiempo de ejecución.
 */
type IsExactly<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const userRoleValues = ['admin', 'teacher'] as const;
export type _CheckUserRole = Expect<IsExactly<(typeof userRoleValues)[number], UserRole>>;
export const userRole = pgEnum('user_role', userRoleValues);

const recordStatusValues = ['active', 'inactive'] as const;
export type _CheckRecordStatus = Expect<
  IsExactly<(typeof recordStatusValues)[number], RecordStatus>
>;
export const recordStatus = pgEnum('record_status', recordStatusValues);

const cardStatusValues = ['active', 'inactive'] as const;
export type _CheckCardStatus = Expect<IsExactly<(typeof cardStatusValues)[number], CardStatus>>;
export const cardStatus = pgEnum('card_status', cardStatusValues);

const deviceModeValues = ['normal', 'enrollment'] as const;
export type _CheckDeviceMode = Expect<IsExactly<(typeof deviceModeValues)[number], DeviceMode>>;
export const deviceMode = pgEnum('device_mode', deviceModeValues);

const deviceStatusValues = ['active', 'revoked'] as const;
export type _CheckDeviceStatus = Expect<
  IsExactly<(typeof deviceStatusValues)[number], DeviceStatus>
>;
export const deviceStatus = pgEnum('device_status', deviceStatusValues);

const eventResultValues = [
  'registered',
  'already_registered',
  'no_session',
  'not_enrolled',
  'unknown_card',
  'enrollment_captured',
  'error',
] as const;
export type _CheckEventResult = Expect<IsExactly<(typeof eventResultValues)[number], EventResult>>;
export const eventResult = pgEnum('event_result', eventResultValues);

const attendanceSourceValues = ['device', 'manual'] as const;
export type _CheckAttendanceSource = Expect<
  IsExactly<(typeof attendanceSourceValues)[number], AttendanceSource>
>;
export const attendanceSource = pgEnum('attendance_source', attendanceSourceValues);

const correctionActionValues = ['mark_present', 'mark_absent', 'update'] as const;
export type _CheckCorrectionAction = Expect<
  IsExactly<(typeof correctionActionValues)[number], CorrectionAction>
>;
export const correctionAction = pgEnum('correction_action', correctionActionValues);

/* -------------------------------------------------------------------------- */
/* Helpers de columna                                                          */
/* -------------------------------------------------------------------------- */

const primaryId = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/* -------------------------------------------------------------------------- */
/* users — cuentas web (admin, profesor)                                       */
/* -------------------------------------------------------------------------- */

/**
 * El `id` ES el `auth.users.id` de Supabase Auth (`data-model.md`): SIEMPRE se pasa explícito al
 * insertar una cuenta creada desde Auth. El default `gen_random_uuid()` existe solo para las filas
 * de desarrollo del seed; una fila con id generado aquí nunca podrá iniciar sesión.
 */
export const users = pgTable('users', {
  id: primaryId(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: userRole('role').notNull(),
  status: recordStatus('status').notNull().default('active'),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* students — entidad de dominio sin cuenta web                                */
/* -------------------------------------------------------------------------- */

/** Minimización de datos (`alcance-v2.md` §16): sin correo y sin programa académico. */
export const students = pgTable('students', {
  id: primaryId(),
  studentCode: text('student_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  status: recordStatus('status').notNull().default('active'),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* cards — carnet RFID                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Separado del estudiante para permitir reposición y reasignación.
 * `student_id` NULL = UID capturado por enrolamiento, todavía sin asignar.
 */
export const cards = pgTable(
  'cards',
  {
    id: primaryId(),
    /** UID hex normalizado en MAYÚSCULAS y sin separadores (8 o 14 caracteres). */
    uid: text('uid').notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'restrict' }),
    status: cardStatus('status').notNull().default('active'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // Índice parcial: un UID solo puede estar activo en un carnet a la vez, pero se conserva el
    // historial de carnets inactivos con el mismo UID (reasignación). Resolver un carnet es
    // buscar el UID activo.
    uniqueIndex('cards_uid_active_unique')
      .on(table.uid)
      .where(sql`${table.status} = 'active'`),
    index('cards_student_id_idx').on(table.studentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* subjects · groups · enrollments · schedules                                 */
/* -------------------------------------------------------------------------- */

/**
 * `status` no aparece en la tabla de `data-model.md`, pero sí en su regla general de eliminación
 * («soft-delete por `status` en entidades de dominio»). Se añade aquí, en la migración inicial,
 * porque después de F1 solo W4 puede migrar: sin esta columna, W1 no podría desactivar una materia
 * sin pedirle una migración a otra lane. `docs/data-model.md` se actualizó en el mismo commit.
 */
export const subjects = pgTable('subjects', {
  id: primaryId(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: recordStatus('status').notNull().default('active'),
  createdAt: createdAt(),
});

export const groups = pgTable(
  'groups',
  {
    id: primaryId(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    /** Nombre corto del grupo, p. ej. "G1". */
    name: text('name').notNull(),
    /** Periodo académico como texto en el MVP, p. ej. "2026-2". */
    term: text('term').notNull(),
    teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'restrict' }),
    /** RN2: minutos antes del inicio programado en que ya se aceptan escaneos. */
    sessionWindowMinutes: integer('session_window_minutes').notNull().default(60),
    status: recordStatus('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('groups_subject_name_term_unique').on(table.subjectId, table.name, table.term),
    index('groups_teacher_id_idx').on(table.teacherId),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: primaryId(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    status: recordStatus('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('enrollments_group_student_unique').on(table.groupId, table.studentId),
    index('enrollments_student_id_idx').on(table.studentId),
  ],
);

/** Horario semanal expresado en hora local `America/Bogota` (RN10). */
export const schedules = pgTable(
  'schedules',
  {
    id: primaryId(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'restrict' }),
    /** Día ISO-8601: 1 = lunes … 7 = domingo. */
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    /** Salón como texto simple en el MVP. */
    room: text('room'),
    createdAt: createdAt(),
  },
  (table) => [
    index('schedules_group_weekday_idx').on(table.groupId, table.weekday),
    check('schedules_weekday_range', sql`${table.weekday} between 1 and 7`),
    check('schedules_time_order', sql`${table.endTime} > ${table.startTime}`),
  ],
);

/* -------------------------------------------------------------------------- */
/* class_sessions — creadas perezosamente (RN3)                                */
/* -------------------------------------------------------------------------- */

export const classSessions = pgTable(
  'class_sessions',
  {
    id: primaryId(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'restrict' }),
    /** Franja del horario de la que nació la sesión. */
    scheduleId: uuid('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    /** Fecha local de Bogotá. */
    sessionDate: date('session_date').notNull(),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // Hace idempotente la creación perezosa bajo concurrencia:
    // INSERT ... ON CONFLICT DO NOTHING + re-select.
    uniqueIndex('class_sessions_group_date_start_unique').on(
      table.groupId,
      table.sessionDate,
      table.scheduledStart,
    ),
    index('class_sessions_scheduled_start_idx').on(table.scheduledStart),
  ],
);

/* -------------------------------------------------------------------------- */
/* devices                                                                     */
/* -------------------------------------------------------------------------- */

export const devices = pgTable('devices', {
  id: primaryId(),
  /** Nombre registrado del dispositivo, p. ej. "LAB-DESARROLLO-01". */
  name: text('name').notNull().unique(),
  /** SHA-256 en hexadecimal de la API key. La key en claro solo se muestra al crearla. */
  apiKeyHash: text('api_key_hash').notNull(),
  mode: deviceMode('mode').notNull().default('normal'),
  status: deviceStatus('status').notNull().default('active'),
  room: text('room'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  firmwareVersion: text('firmware_version'),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* rfid_events — bitácora inmutable (RN1)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Toda lectura recibida queda aquí: **es** el registro de a qué hora entró la persona, exista o
 * no una sesión de clase que coincida. Nunca se actualiza por negocio ni se borra.
 */
export const rfidEvents = pgTable(
  'rfid_events',
  {
    id: primaryId(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    /** UUID generado por el dispositivo, único por lectura física (RN7). */
    eventId: text('event_id').notNull(),
    /** UID normalizado tal como se recibió, aunque no exista carnet asociado. */
    cardUid: text('card_uid').notNull(),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'restrict' }),
    /** Reloj del dispositivo: informativo (RN8). */
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    /** Hora del servidor: fuente de verdad de la hora de entrada (RN8). */
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    result: eventResult('result').notNull(),
    /** Respuesta exacta devuelta al dispositivo; se reenvía tal cual en los reintentos (RN7). */
    response: jsonb('response').notNull(),
  },
  (table) => [
    // Clave de idempotencia del contrato v1.
    uniqueIndex('rfid_events_device_event_unique').on(table.deviceId, table.eventId),
    index('rfid_events_card_uid_received_at_idx').on(table.cardUid, table.receivedAt),
    index('rfid_events_received_at_idx').on(table.receivedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* attendances                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sin estado "tarde" (RN4) ni filas para "ausente" (RN5): ausente = inscrito sin fila en la
 * sesión, calculado con LEFT JOIN al consultar.
 */
export const attendances = pgTable(
  'attendances',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    /** `received_at` del evento, o el valor fijado por una corrección manual. */
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull(),
    source: attendanceSource('source').notNull(),
    /** Evento que originó la asistencia; NULL cuando `source = 'manual'`. */
    eventId: uuid('event_id').references(() => rfidEvents.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // RN6: máximo una asistencia por (sesión, estudiante).
    uniqueIndex('attendances_session_student_unique').on(table.sessionId, table.studentId),
    index('attendances_student_id_idx').on(table.studentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* attendance_corrections — auditoría mínima (RN9), inmutable                  */
/* -------------------------------------------------------------------------- */

/**
 * Referencia `session_id` + `student_id` además de `attendance_id` para que "marcar ausente"
 * —que borra la fila de asistencia— no rompa la trazabilidad.
 */
export const attendanceCorrections = pgTable(
  'attendance_corrections',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    /** NULL si la corrección eliminó la asistencia. */
    attendanceId: uuid('attendance_id').references(() => attendances.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: correctionAction('action').notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('attendance_corrections_session_student_idx').on(table.sessionId, table.studentId),
    index('attendance_corrections_created_at_idx').on(table.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Inventario de tablas                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Nombres físicos de todas las tablas del esquema. Se usa para comprobar que la migración de
 * RLS deny-all no deja ninguna tabla fuera (ver `src/schema.test.ts`).
 */
export const TABLE_NAMES = [
  'users',
  'students',
  'cards',
  'subjects',
  'groups',
  'enrollments',
  'schedules',
  'class_sessions',
  'devices',
  'rfid_events',
  'attendances',
  'attendance_corrections',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];
