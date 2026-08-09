/**
 * Estado que las server actions de dispositivos devuelven a los formularios.
 *
 * Vive fuera de `actions.ts` porque un archivo `'use server'` solo puede exportar funciones
 * asíncronas.
 */

/** Resultado de un formulario: nada todavía, un error de negocio o una operación aplicada. */
export interface ActionState {
  status: 'idle' | 'error' | 'success';
  /** Mensaje en español para mostrar al administrador. */
  message?: string | undefined;
}

export const IDLE: ActionState = { status: 'idle' };

/** Estado del alta: además del mensaje, trae la credencial que solo se puede mostrar una vez. */
export interface CreateDeviceState extends ActionState {
  /** Credencial en claro recién emitida. Se muestra UNA SOLA VEZ y no se puede recuperar. */
  apiKey?: string | undefined;
  deviceName?: string | undefined;
}

export const CREATE_DEVICE_IDLE: CreateDeviceState = { status: 'idle' };
