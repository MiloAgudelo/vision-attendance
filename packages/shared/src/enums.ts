/**
 * Enums de dominio.
 *
 * Cada constante de este archivo está alineada 1:1 (mismo nombre de tipo Postgres y mismos
 * valores, en el mismo orden) con los enums definidos en `docs/data-model.md` y creados por las
 * migraciones de `@va/db`. Si cambia uno, cambia el otro.
 */

/** Enum Postgres `user_role`: rol de una cuenta web. */
export const USER_ROLES = ['admin', 'teacher'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Enum Postgres `record_status`: soft-delete de las entidades de dominio. */
export const RECORD_STATUSES = ['active', 'inactive'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Enum Postgres `card_status`: estado de un carnet RFID. */
export const CARD_STATUSES = ['active', 'inactive'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** Enum Postgres `device_mode`: modo de operación del lector. */
export const DEVICE_MODES = ['normal', 'enrollment'] as const;
export type DeviceMode = (typeof DEVICE_MODES)[number];

/** Enum Postgres `device_status`: vigencia de la credencial del dispositivo. */
export const DEVICE_STATUSES = ['active', 'revoked'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** Enum Postgres `event_result`: desenlace de negocio de un evento RFID. */
export const EVENT_RESULTS = [
  'registered',
  'already_registered',
  'no_session',
  'not_enrolled',
  'unknown_card',
  'enrollment_captured',
  'error',
] as const;
export type EventResult = (typeof EVENT_RESULTS)[number];

/** Enum Postgres `attendance_source`: de dónde salió una asistencia (RN5). */
export const ATTENDANCE_SOURCES = ['device', 'manual'] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

/** Enum Postgres `correction_action`: tipo de corrección manual auditada (RN9). */
export const CORRECTION_ACTIONS = ['mark_present', 'mark_absent', 'update'] as const;
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number];
