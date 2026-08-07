/**
 * Contrato de integración de dispositivos — v1.
 *
 * Implementación ejecutable de `docs/device-contract.md`. Es la fuente de verdad compartida entre
 * `apps/web` (servidor), `tools/simulator` y el futuro firmware ESP32. Cualquier cambio de contrato
 * modifica este archivo Y el documento en el mismo PR.
 */

import { z } from 'zod';
import { EVENT_RESULTS } from '../enums.js';

/** Versión mayor del contrato soportada por esta compilación. */
export const CONTRACT_VERSION = 1 as const;

/** Ruta del endpoint de ingesta de eventos. */
export const DEVICE_EVENTS_PATH = '/api/v1/events' as const;

/** Esquema de autorización HTTP usado por el dispositivo. */
export const DEVICE_AUTH_SCHEME = 'Bearer' as const;

/** Prefijo de las credenciales de dispositivo: `vad_<deviceName>_<secreto>`. */
export const DEVICE_API_KEY_PREFIX = 'vad' as const;

/* -------------------------------------------------------------------------- */
/* UID del carnet                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Longitudes válidas del UID ya normalizado: 8 caracteres (4 bytes) o 14 (7 bytes).
 * Ver `docs/alcance-v2.md` §18.2.
 */
export const CARD_UID_LENGTHS = [8, 14] as const;

/** Separadores que los lectores suelen intercalar entre bytes y que se descartan. */
const CARD_UID_SEPARATORS = /[\s:.\-_]/g;

/** UID ya normalizado: hexadecimal en mayúsculas, sin separadores, de 8 o 14 caracteres. */
const NORMALIZED_CARD_UID = /^(?:[0-9A-F]{8}|[0-9A-F]{14})$/;

/**
 * Normaliza un UID: elimina separadores (espacios, `:`, `.`, `-`, `_`) y pasa a MAYÚSCULAS.
 * No valida: usa {@link isValidCardUid} o {@link parseCardUid} para eso.
 */
export function normalizeCardUid(raw: string): string {
  return raw.replace(CARD_UID_SEPARATORS, '').toUpperCase();
}

/** ¿El valor es un UID YA normalizado y válido? */
export function isValidCardUid(value: string): boolean {
  return NORMALIZED_CARD_UID.test(value);
}

/** Error lanzado por {@link parseCardUid} cuando el UID no cumple el contrato. */
export class InvalidCardUidError extends Error {
  readonly rawValue: string;

  constructor(rawValue: string) {
    super(
      `UID de carnet inválido: se esperaba hexadecimal de ${CARD_UID_LENGTHS.join(' o ')} ` +
        `caracteres (4 o 7 bytes); se recibió ${JSON.stringify(rawValue)}`,
    );
    this.name = 'InvalidCardUidError';
    this.rawValue = rawValue;
  }
}

/**
 * Normaliza y valida un UID en un solo paso.
 * @throws {InvalidCardUidError} si el resultado no es hexadecimal de 8 o 14 caracteres.
 */
export function parseCardUid(raw: string): string {
  const normalized = normalizeCardUid(raw.trim());
  if (!isValidCardUid(normalized)) {
    throw new InvalidCardUidError(raw);
  }
  return normalized;
}

/** Zod: acepta un UID en cualquier presentación y devuelve el normalizado. */
export const cardUidSchema = z.string().trim().transform(normalizeCardUid).refine(isValidCardUid, {
  message: 'El UID debe ser hexadecimal de 8 o 14 caracteres (4 o 7 bytes)',
});

/* -------------------------------------------------------------------------- */
/* Credencial del dispositivo                                                  */
/* -------------------------------------------------------------------------- */

/** Forma de la API key del dispositivo: `vad_<deviceName>_<secreto>`. */
const DEVICE_API_KEY = /^vad_[A-Za-z0-9-]+_[A-Za-z0-9_-]{16,}$/;

/** Longitud máxima del nombre de un dispositivo (`devices.name`). */
export const DEVICE_NAME_MAX_LENGTH = 120;

/**
 * Nombre de dispositivo admisible.
 *
 * El nombre viaja DENTRO de la credencial (`vad_<deviceName>_<secreto>`), que a su vez viaja en una
 * cabecera `Authorization`. Por eso no puede contener el separador `_`, ni espacios, ni caracteres
 * fuera de US-ASCII: se restringe a letras, dígitos y guiones (ej. `LAB-DESARROLLO-01`).
 */
const DEVICE_NAME = /^[A-Za-z0-9-]+$/;

/** ¿El nombre sirve para construir una credencial válida? */
export function isValidDeviceName(value: string): boolean {
  return value.length <= DEVICE_NAME_MAX_LENGTH && DEVICE_NAME.test(value);
}

/** Error lanzado por {@link formatDeviceApiKey} cuando el nombre no puede formar una credencial. */
export class InvalidDeviceNameError extends Error {
  readonly rawValue: string;

  constructor(rawValue: string) {
    super(
      `Nombre de dispositivo inválido: solo se admiten letras, dígitos y guiones ` +
        `(máximo ${DEVICE_NAME_MAX_LENGTH} caracteres); se recibió ${JSON.stringify(rawValue)}`,
    );
    this.name = 'InvalidDeviceNameError';
    this.rawValue = rawValue;
  }
}

/** Zod: nombre de dispositivo, aplicable al alta en el CRUD de dispositivos (W2). */
export const deviceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(DEVICE_NAME_MAX_LENGTH)
  .refine(isValidDeviceName, {
    message: 'El nombre solo admite letras, dígitos y guiones (sin espacios ni guion bajo)',
  });

/**
 * Construye una credencial con la forma del contrato.
 *
 * @throws {InvalidDeviceNameError} si el nombre no puede formar una credencial válida. Falla aquí,
 * al crear el dispositivo, y no en el primer POST del lector.
 */
export function formatDeviceApiKey(deviceName: string, secret: string): string {
  if (!isValidDeviceName(deviceName)) {
    throw new InvalidDeviceNameError(deviceName);
  }
  return `${DEVICE_API_KEY_PREFIX}_${deviceName}_${secret}`;
}

/** ¿La cadena tiene la forma de una credencial de dispositivo? (no comprueba que exista) */
export function isDeviceApiKeyShaped(value: string): boolean {
  return DEVICE_API_KEY.test(value);
}

/* -------------------------------------------------------------------------- */
/* Petición                                                                    */
/* -------------------------------------------------------------------------- */

/** ¿La versión de contrato recibida es compatible con esta compilación? */
export function isSupportedContractVersion(version: number): boolean {
  return version === CONTRACT_VERSION;
}

/**
 * Sonda de versión: se valida ANTES que el cuerpo completo.
 *
 * El contrato distingue dos errores 400 (`docs/device-contract.md`): `unsupported_contract` cuando
 * la versión mayor es incompatible e `invalid_payload` para el resto. Con
 * {@link deviceEventRequestSchema} solo, un `contractVersion: 2` es indistinguible de un cuerpo
 * malformado. El servidor (W2) lee primero esta sonda, decide `unsupported_contract` si procede, y
 * solo entonces valida el cuerpo completo.
 */
export const contractVersionProbeSchema = z.looseObject({
  contractVersion: z.number().int(),
});

/**
 * Cuerpo de `POST /api/v1/events`.
 *
 * Las claves desconocidas se descartan (no se rechaza la petición) para que un firmware más nuevo
 * pueda añadir campos informativos sin romper el servidor.
 */
export const deviceEventRequestSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  deviceId: z.string().trim().min(1).max(DEVICE_NAME_MAX_LENGTH),
  // Se canoniza a minúsculas: `(device_id, event_id)` es la clave de idempotencia (RN7) y se
  // almacena como texto, así que el mismo UUID reenviado con otra caja debe colisionar, no duplicar.
  eventId: z.uuid().transform((value) => value.toLowerCase()),
  cardUid: cardUidSchema,
  scannedAt: z.iso.datetime({ offset: true }).nullish(),
  // `nullish` igual que scannedAt: un firmware que serialice los campos ausentes como null no debe
  // recibir 400 por un dato meramente informativo.
  firmwareVersion: z.string().trim().min(1).max(64).nullish(),
});

export type DeviceEventRequest = z.infer<typeof deviceEventRequestSchema>;
export type DeviceEventRequestInput = z.input<typeof deviceEventRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Respuesta 200 — evento procesado                                            */
/* -------------------------------------------------------------------------- */

export const eventResultSchema = z.enum(EVENT_RESULTS);

export const deviceEventStudentSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});
export type DeviceEventStudent = z.infer<typeof deviceEventStudentSchema>;

export const deviceEventSessionSchema = z.object({
  id: z.uuid(),
  scheduledStart: z.iso.datetime({ offset: true }),
});
export type DeviceEventSession = z.infer<typeof deviceEventSessionSchema>;

/**
 * Toda lectura procesada responde 200, incluso con resultado de negocio negativo: el firmware
 * decide LED/buzzer por `result`, no por el código HTTP.
 */
export const deviceEventSuccessResponseSchema = z.object({
  ok: z.literal(true),
  eventId: z.uuid(),
  result: eventResultSchema,
  receivedAt: z.iso.datetime({ offset: true }),
  message: z.string().min(1),
  student: deviceEventStudentSchema.nullable(),
  session: deviceEventSessionSchema.nullable(),
});
export type DeviceEventSuccessResponse = z.infer<typeof deviceEventSuccessResponseSchema>;

/** Mensajes en español por defecto para cada `result` (pensados para una pantalla futura). */
export const EVENT_RESULT_MESSAGES = {
  registered: 'Asistencia registrada',
  already_registered: 'Ya estabas registrado en esta clase',
  no_session: 'Entrada registrada; no hay clase activa',
  not_enrolled: 'Entrada registrada; no estás inscrito en el grupo',
  unknown_card: 'Carnet no registrado',
  enrollment_captured: 'Carnet capturado',
  error: 'Error interno; la lectura quedó registrada',
} as const satisfies Record<(typeof EVENT_RESULTS)[number], string>;

/* -------------------------------------------------------------------------- */
/* Respuestas de error                                                         */
/* -------------------------------------------------------------------------- */

export const DEVICE_ERROR_CODES = [
  'invalid_payload',
  'unsupported_contract',
  'invalid_credentials',
  'device_revoked',
  'device_mismatch',
  'rate_limited',
  'internal_error',
] as const;
export type DeviceErrorCode = (typeof DEVICE_ERROR_CODES)[number];

export const deviceErrorCodeSchema = z.enum(DEVICE_ERROR_CODES);

export const deviceEventErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: deviceErrorCodeSchema,
  message: z.string().min(1),
});
export type DeviceEventErrorResponse = z.infer<typeof deviceEventErrorResponseSchema>;

/** Código HTTP con el que se devuelve cada error del contrato. */
export const DEVICE_ERROR_HTTP_STATUS = {
  invalid_payload: 400,
  unsupported_contract: 400,
  invalid_credentials: 401,
  device_revoked: 403,
  device_mismatch: 403,
  rate_limited: 429,
  internal_error: 500,
} as const satisfies Record<DeviceErrorCode, number>;

/** Mensajes en español por defecto para cada error. */
export const DEVICE_ERROR_MESSAGES = {
  invalid_payload: 'Cuerpo de la solicitud inválido',
  unsupported_contract: 'Versión de contrato no soportada',
  invalid_credentials: 'Credenciales inválidas',
  device_revoked: 'Dispositivo revocado',
  device_mismatch: 'El deviceId no corresponde a la credencial',
  rate_limited: 'Demasiadas solicitudes',
  internal_error: 'Error interno',
} as const satisfies Record<DeviceErrorCode, string>;

/** ¿Tiene sentido que el dispositivo reintente este error? (`docs/device-contract.md`) */
export const DEVICE_ERROR_RETRYABLE = {
  invalid_payload: false,
  unsupported_contract: false,
  invalid_credentials: false,
  device_revoked: false,
  device_mismatch: false,
  rate_limited: true,
  internal_error: true,
} as const satisfies Record<DeviceErrorCode, boolean>;

/** Cualquier respuesta del endpoint: éxito de negocio o error de transporte/credenciales. */
export const deviceEventResponseSchema = z.discriminatedUnion('ok', [
  deviceEventSuccessResponseSchema,
  deviceEventErrorResponseSchema,
]);
export type DeviceEventResponse = z.infer<typeof deviceEventResponseSchema>;
