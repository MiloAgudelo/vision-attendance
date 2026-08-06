'use server';

/**
 * Server actions del panel de dispositivos.
 *
 * Los componentes nunca hablan con Drizzle (`docs/architecture.md` §4.3): estas acciones son el
 * único puente entre los formularios y `src/server/devices/`.
 *
 * Todavía **no hay autenticación** (login y roles son de la lane W5): estas acciones quedan
 * abiertas a propósito y W5 las pondrá detrás de autorización de administrador.
 */

import { revalidatePath } from 'next/cache';

import { createDevice, revokeDevice, setDeviceMode } from '@/server/devices/devices';
import { BusinessRuleError } from '@/server/devices/errors';
import { deviceModeSchema } from '@/server/devices/schemas';

import type { ActionState, CreateDeviceState } from './form-state';

const DEVICES_PATH = '/devices';

/** Convierte un error de negocio en estado del formulario y deja pasar lo demás. */
function toErrorState(error: unknown): ActionState {
  if (error instanceof BusinessRuleError) return { status: 'error', message: error.message };
  throw error;
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value : '';
}

/**
 * Da de alta un dispositivo y devuelve su credencial en claro.
 *
 * La credencial viaja una única vez, en el estado del formulario: en la base solo queda su
 * SHA-256 y no hay forma de volver a mostrarla.
 */
export async function createDeviceAction(
  _previous: CreateDeviceState,
  formData: FormData,
): Promise<CreateDeviceState> {
  try {
    const { device, apiKey } = await createDevice({
      name: text(formData, 'name'),
      room: text(formData, 'room'),
    });

    revalidatePath(DEVICES_PATH);
    return {
      status: 'success',
      message: `Dispositivo «${device.name}» registrado.`,
      apiKey,
      deviceName: device.name,
    };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Revoca un dispositivo: su credencial deja de servir de inmediato. */
export async function revokeDeviceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const device = await revokeDevice(text(formData, 'deviceId'));
    revalidatePath(DEVICES_PATH);
    return { status: 'success', message: `Dispositivo «${device.name}» revocado.` };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Cambia el modo del lector entre `normal` y `enrollment`. */
export async function setDeviceModeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const mode = deviceModeSchema.safeParse(text(formData, 'mode'));
    if (!mode.success) return { status: 'error', message: 'Modo de dispositivo inválido.' };

    const device = await setDeviceMode(text(formData, 'deviceId'), mode.data);
    revalidatePath(DEVICES_PATH);
    return {
      status: 'success',
      message:
        device.mode === 'enrollment'
          ? `«${device.name}» pasó a modo enrolamiento: capturará los carnets que lea.`
          : `«${device.name}» volvió a modo normal.`,
    };
  } catch (error) {
    return toErrorState(error);
  }
}
