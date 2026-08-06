/**
 * Operaciones de servidor sobre `devices`.
 *
 * Toda mutación de dispositivos pasa por aquí (`docs/architecture.md` §4.3): los componentes de
 * React nunca hablan con Drizzle. El módulo no depende de Next, así que se prueba sin HTTP.
 */

import { getDatabase, devices, type Database } from '@va/db';
import { InvalidDeviceNameError, type DeviceMode, type DeviceStatus } from '@va/shared';
import { desc, eq } from 'drizzle-orm';

import { hashDeviceApiKey, issueDeviceApiKey } from './credentials';
import { BusinessRuleError, isUniqueViolation } from './errors';
import {
  createDeviceInputSchema,
  deviceIdSchema,
  deviceModeSchema,
  type CreateDeviceInput,
} from './schemas';

/** Dependencias inyectables: las pruebas pasan su propia conexión. */
export interface DeviceServiceOptions {
  database?: Database;
}

function resolveDatabase(options: DeviceServiceOptions = {}): Database {
  return options.database ?? getDatabase();
}

/** Dispositivo tal como lo necesita la interfaz de administración. Nunca incluye el hash. */
export interface DeviceSummary {
  id: string;
  name: string;
  mode: DeviceMode;
  status: DeviceStatus;
  room: string | null;
  lastSeenAt: Date | null;
  firmwareVersion: string | null;
  createdAt: Date;
}

const deviceSummaryColumns = {
  id: devices.id,
  name: devices.name,
  mode: devices.mode,
  status: devices.status,
  room: devices.room,
  lastSeenAt: devices.lastSeenAt,
  firmwareVersion: devices.firmwareVersion,
  createdAt: devices.createdAt,
} as const;

/** Lista los dispositivos registrados, el más reciente primero. */
export async function listDevices(options: DeviceServiceOptions = {}): Promise<DeviceSummary[]> {
  return resolveDatabase(options)
    .select(deviceSummaryColumns)
    .from(devices)
    .orderBy(desc(devices.createdAt));
}

/** Resultado del alta: la credencial en claro viaja aquí y **no vuelve a estar disponible**. */
export interface CreatedDevice {
  device: DeviceSummary;
  /** Credencial completa. Se muestra una única vez en la interfaz; en la base solo queda su hash. */
  apiKey: string;
}

/**
 * Da de alta un dispositivo y emite su credencial.
 *
 * @throws {BusinessRuleError} si el nombre ya existe o no sirve para formar una credencial.
 */
export async function createDevice(
  input: CreateDeviceInput,
  options: DeviceServiceOptions = {},
): Promise<CreatedDevice> {
  const parsed = createDeviceInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BusinessRuleError(
      parsed.error.issues[0]?.message ?? 'Los datos del dispositivo no son válidos.',
    );
  }

  let credential;
  try {
    credential = issueDeviceApiKey(parsed.data.name);
  } catch (error) {
    if (error instanceof InvalidDeviceNameError) {
      throw new BusinessRuleError(
        'El nombre solo admite letras, dígitos y guiones: viaja dentro de la credencial del lector.',
      );
    }
    throw error;
  }

  try {
    const [device] = await resolveDatabase(options)
      .insert(devices)
      .values({
        name: parsed.data.name,
        apiKeyHash: credential.apiKeyHash,
        room: parsed.data.room,
      })
      .returning(deviceSummaryColumns);

    if (!device) throw new Error('El alta del dispositivo no devolvió ninguna fila.');
    return { device, apiKey: credential.apiKey };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new BusinessRuleError(`Ya existe un dispositivo llamado «${parsed.data.name}».`);
    }
    throw error;
  }
}

/**
 * Revoca un dispositivo: `status = 'revoked'`.
 *
 * Es la única forma de invalidar una credencial (no hay rotación en el MVP). A partir de aquí sus
 * eventos se rechazan con 403 y **no se procesan ni se registran**.
 */
export async function revokeDevice(
  deviceId: string,
  options: DeviceServiceOptions = {},
): Promise<DeviceSummary> {
  const id = parseDeviceId(deviceId);

  const [device] = await resolveDatabase(options)
    .update(devices)
    .set({ status: 'revoked' })
    .where(eq(devices.id, id))
    .returning(deviceSummaryColumns);

  if (!device) throw new BusinessRuleError('El dispositivo indicado ya no existe.');
  return device;
}

/** Cambia el modo del lector entre `normal` y `enrollment`. */
export async function setDeviceMode(
  deviceId: string,
  mode: DeviceMode,
  options: DeviceServiceOptions = {},
): Promise<DeviceSummary> {
  const id = parseDeviceId(deviceId);

  const parsedMode = deviceModeSchema.safeParse(mode);
  if (!parsedMode.success) throw new BusinessRuleError('Modo de dispositivo inválido.');

  const [device] = await resolveDatabase(options)
    .update(devices)
    .set({ mode: parsedMode.data })
    .where(eq(devices.id, id))
    .returning(deviceSummaryColumns);

  if (!device) throw new BusinessRuleError('El dispositivo indicado ya no existe.');
  return device;
}

function parseDeviceId(value: string): string {
  const parsed = deviceIdSchema.safeParse(value);
  if (!parsed.success) throw new BusinessRuleError('El dispositivo indicado no es válido.');
  return parsed.data;
}

/* -------------------------------------------------------------------------- */
/* Autenticación del lector                                                    */
/* -------------------------------------------------------------------------- */

/** Dispositivo autenticado, con lo que el pipeline de eventos necesita saber de él. */
export interface AuthenticatedDevice {
  id: string;
  name: string;
  mode: DeviceMode;
  status: DeviceStatus;
  room: string | null;
}

/**
 * Resuelve el dispositivo dueño de una credencial.
 *
 * Recibe la key en claro y busca **por su SHA-256**: la key nunca se compara contra la base ni se
 * registra en ningún log (`docs/architecture.md` §4.7). Devuelve también los revocados, para que
 * quien llama pueda distinguir 401 (credencial inexistente) de 403 (dispositivo revocado).
 */
export async function findDeviceByApiKey(
  apiKey: string,
  options: DeviceServiceOptions = {},
): Promise<AuthenticatedDevice | null> {
  const [device] = await resolveDatabase(options)
    .select({
      id: devices.id,
      name: devices.name,
      mode: devices.mode,
      status: devices.status,
      room: devices.room,
    })
    .from(devices)
    .where(eq(devices.apiKeyHash, hashDeviceApiKey(apiKey)))
    .limit(1);

  return device ?? null;
}

/**
 * Deja constancia de que el dispositivo acaba de contactar: `last_seen_at` y `firmware_version`.
 *
 * Es un efecto secundario de diagnóstico, no parte del resultado del evento: se ejecuta también en
 * los reintentos idempotentes y **nunca hace fallar la petición** (si falla, se registra y sigue).
 */
export async function recordDeviceContact(
  deviceId: string,
  contact: { seenAt: Date; firmwareVersion?: string | null | undefined },
  options: DeviceServiceOptions = {},
): Promise<void> {
  try {
    await resolveDatabase(options)
      .update(devices)
      .set({
        lastSeenAt: contact.seenAt,
        // Un firmware que no informe su versión no borra la última conocida.
        ...(contact.firmwareVersion ? { firmwareVersion: contact.firmwareVersion } : {}),
      })
      .where(eq(devices.id, deviceId));
  } catch (error) {
    console.error('[devices] no se pudo actualizar la última conexión del dispositivo:', error);
  }
}
