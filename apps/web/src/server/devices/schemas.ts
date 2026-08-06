/**
 * Validación (Zod) de las operaciones administrativas sobre dispositivos.
 *
 * El nombre reutiliza `deviceNameSchema` de `@va/shared`, que es quien sabe qué nombres pueden
 * viajar dentro de una credencial `vad_<nombre>_<secreto>`.
 */

import { DEVICE_MODES, deviceNameSchema } from '@va/shared';
import { z } from 'zod';

/** Longitud máxima del salón (texto simple en el MVP, `docs/data-model.md`). */
export const DEVICE_ROOM_MAX_LENGTH = 120;

/** Salón: texto opcional. Los formularios envían `''` cuando el campo queda vacío. */
export const deviceRoomSchema = z
  .string()
  .trim()
  .max(DEVICE_ROOM_MAX_LENGTH)
  .nullish()
  .transform((value) => (value ? value : null));

export const deviceIdSchema = z.uuid('Identificador de dispositivo inválido');

export const deviceModeSchema = z.enum(DEVICE_MODES, 'Modo de dispositivo inválido');

export const createDeviceInputSchema = z.object({
  name: deviceNameSchema,
  room: deviceRoomSchema,
});
export type CreateDeviceInput = z.input<typeof createDeviceInputSchema>;

export const setDeviceModeInputSchema = z.object({
  deviceId: deviceIdSchema,
  mode: deviceModeSchema,
});

export const revokeDeviceInputSchema = z.object({
  deviceId: deviceIdSchema,
});
