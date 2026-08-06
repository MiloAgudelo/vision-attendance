/**
 * Generador de lecturas.
 *
 * Construye el cuerpo de `POST /api/v1/events` exactamente como lo hará el firmware ESP32 y lo
 * valida contra los esquemas de `@va/shared` antes de devolverlo. Es puro: no toca la red ni el
 * sistema de archivos, y el reloj se puede inyectar, así que es directamente testeable.
 */

import { randomBytes, randomUUID } from 'node:crypto';

import { CONTRACT_VERSION, deviceEventRequestSchema, type DeviceEventRequest } from '@va/shared';

import { InvalidEventError, SimulatorError } from './errors.js';

/**
 * Valor por defecto de `firmwareVersion`. Deja constancia en la bitácora de que la lectura salió
 * del simulador y no de un lector físico.
 */
export const SIMULATOR_FIRMWARE_VERSION = 'simulator-0.1.0';

/** Longitudes de UID que emite el RC522, en bytes (`docs/alcance-v2.md` §18.2). */
export type CardUidBytes = 4 | 7;

/**
 * Genera un `eventId` uuid v4.
 *
 * Uno por lectura FÍSICA, no por petición: los reintentos de una misma lectura reutilizan este
 * mismo identificador (RN7). Usa `node:crypto`, sin dependencias externas.
 */
export function newEventId(): string {
  return randomUUID();
}

/** Genera un UID de carnet aleatorio ya normalizado (hexadecimal en mayúsculas). */
export function randomCardUid(bytes: CardUidBytes = 4): string {
  return randomBytes(bytes).toString('hex').toUpperCase();
}

/**
 * Formatea un instante como ISO-8601 con offset explícito, que es lo que exige el contrato para
 * `scannedAt`. Con `offsetMinutes === 0` emite el sufijo `Z`.
 */
export function toIsoWithOffset(date: Date, offsetMinutes: number): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  const stamp =
    `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}` +
    `.${pad(shifted.getUTCMilliseconds(), 3)}`;

  if (offsetMinutes === 0) {
    return `${stamp}Z`;
  }
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  return `${stamp}${sign}${pad(Math.trunc(absolute / 60))}:${pad(absolute % 60)}`;
}

const DURATION_UNITS_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

const DURATION_TERM = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/gy;

/**
 * Convierte una duración legible en milisegundos: `-3h`, `90m`, `1h30m`, `250ms`, `-1d2h`.
 *
 * Se usa para `--scanned-at-offset`, que desplaza el reloj del dispositivo respecto al real y
 * permite comprobar que la hora oficial la pone el servidor (RN8).
 */
export function parseDurationMs(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new SimulatorError('Duración vacía: se esperaba algo como "-3h", "90m" o "250ms".');
  }

  const negative = trimmed.startsWith('-');
  const body = negative || trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;

  DURATION_TERM.lastIndex = 0;
  let total = 0;
  let terms = 0;
  // `lastIndex` se lleva a mano: una regex `y` lo reinicia a 0 cuando el `exec` falla, así que no
  // sirve para saber cuánto texto se consumió.
  let consumed = 0;
  let match = DURATION_TERM.exec(body);
  while (match !== null) {
    const [term, amount, unit] = match;
    if (amount === undefined || unit === undefined) {
      break;
    }
    total += Number(amount) * DURATION_UNITS_MS[unit as keyof typeof DURATION_UNITS_MS];
    consumed += term.length;
    terms += 1;
    match = DURATION_TERM.exec(body);
  }

  if (terms === 0 || consumed !== body.length) {
    throw new SimulatorError(
      `Duración inválida: ${JSON.stringify(text)}. Formato esperado: un signo opcional y ` +
        'uno o más términos número+unidad (ms, s, m, h, d). Ejemplos: "-3h", "90m", "1h30m".',
    );
  }

  return negative ? -total : total;
}

export interface BuildDeviceEventOptions {
  /** Nombre del dispositivo registrado; debe coincidir con el de la credencial. */
  deviceId: string;
  /** UID del carnet en cualquier presentación: se normaliza a mayúsculas sin separadores. */
  cardUid: string;
  /** `eventId` a reutilizar. Si se omite, se genera uno nuevo (una lectura física nueva). */
  eventId?: string | undefined;
  /**
   * `scannedAt` explícito: ISO-8601 con offset, o `null` si el dispositivo no tiene hora fiable.
   * Si se omite, se calcula desde el reloj con {@link BuildDeviceEventOptions.scannedAtOffsetMs}.
   */
  scannedAt?: string | null | undefined;
  /** Desplazamiento del reloj del dispositivo respecto al real, en ms (negativo = atrasado). */
  scannedAtOffsetMs?: number | undefined;
  /** Offset horario con el que el dispositivo declara su hora. Por defecto, el del proceso. */
  clockOffsetMinutes?: number | undefined;
  /** `firmwareVersion`; `null` para omitirlo explícitamente. */
  firmwareVersion?: string | null | undefined;
  /** Reloj inyectable, para pruebas deterministas. */
  now?: Date | undefined;
}

function resolveScannedAt(options: BuildDeviceEventOptions, now: Date): string | null {
  if (options.scannedAt !== undefined) {
    return options.scannedAt;
  }
  const scannedAt = new Date(now.getTime() + (options.scannedAtOffsetMs ?? 0));
  const offsetMinutes = options.clockOffsetMinutes ?? -scannedAt.getTimezoneOffset();
  return toIsoWithOffset(scannedAt, offsetMinutes);
}

/**
 * Construye y valida el cuerpo de una lectura.
 *
 * @throws {InvalidEventError} si el cuerpo resultante no cumple el contrato v1 (UID con longitud
 * incorrecta, `eventId` que no es uuid, `scannedAt` sin offset…).
 */
export function buildDeviceEvent(options: BuildDeviceEventOptions): DeviceEventRequest {
  const now = options.now ?? new Date();
  const candidate = {
    contractVersion: CONTRACT_VERSION,
    deviceId: options.deviceId,
    eventId: options.eventId ?? newEventId(),
    cardUid: options.cardUid,
    scannedAt: resolveScannedAt(options, now),
    firmwareVersion:
      options.firmwareVersion === undefined ? SIMULATOR_FIRMWARE_VERSION : options.firmwareVersion,
  };

  const parsed = deviceEventRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidEventError(candidate, parsed.error);
  }
  return parsed.data;
}
