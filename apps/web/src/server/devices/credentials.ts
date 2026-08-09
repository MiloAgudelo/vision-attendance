/**
 * Credenciales de dispositivo: generación, hash y lectura de la cabecera `Authorization`.
 *
 * La credencial tiene la forma `vad_<nombre>_<secreto>` (`docs/device-contract.md`) y en la base
 * solo vive su **SHA-256** (`docs/architecture.md` §4.7): la key en claro se muestra una única vez,
 * al crear el dispositivo, y nunca se puede recuperar.
 *
 * Módulo puro: no toca la base ni depende de Next.
 */

import { createHash, randomBytes } from 'node:crypto';

import { DEVICE_AUTH_SCHEME, formatDeviceApiKey, isDeviceApiKeyShaped } from '@va/shared';

/** Bytes de entropía del secreto de una credencial (256 bits, en base64url). */
export const DEVICE_SECRET_BYTES = 32;

/** Genera el secreto de alta entropía que va dentro de la credencial. */
export function generateDeviceSecret(): string {
  return randomBytes(DEVICE_SECRET_BYTES).toString('base64url');
}

/**
 * Hash con el que se almacena y se busca una credencial.
 *
 * SHA-256 y no bcrypt/argon2 a propósito: la key es un secreto aleatorio de 256 bits (no una
 * contraseña humana), así que no hay nada que derivar por fuerza bruta, y el hash tiene que poder
 * usarse como **clave de búsqueda indexada** en cada evento del lector.
 */
export function hashDeviceApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

/** Credencial recién emitida: la key en claro solo existe en memoria, aquí y en la respuesta. */
export interface IssuedDeviceApiKey {
  /** Credencial completa `vad_<nombre>_<secreto>`. Se muestra UNA SOLA VEZ. */
  readonly apiKey: string;
  /** SHA-256 hexadecimal, lo único que se persiste. */
  readonly apiKeyHash: string;
}

/**
 * Emite una credencial nueva para un dispositivo.
 *
 * @throws {InvalidDeviceNameError} si el nombre no puede formar una credencial válida.
 */
export function issueDeviceApiKey(deviceName: string): IssuedDeviceApiKey {
  const apiKey = formatDeviceApiKey(deviceName, generateDeviceSecret());
  return { apiKey, apiKeyHash: hashDeviceApiKey(apiKey) };
}

/**
 * Extrae la credencial de una cabecera `Authorization: Bearer vad_…`.
 *
 * Devuelve `null` —que el endpoint traduce a 401 `invalid_credentials`— si la cabecera falta, usa
 * otro esquema, trae más de un token o el token no tiene la forma del contrato. Comprobar la forma
 * aquí evita ir a la base con basura.
 */
export function extractBearerApiKey(header: string | null | undefined): string | null {
  if (!header) return null;

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;

  const [scheme, token] = parts;
  if (scheme?.toLowerCase() !== DEVICE_AUTH_SCHEME.toLowerCase()) return null;
  if (!token || !isDeviceApiKeyShaped(token)) return null;

  return token;
}
