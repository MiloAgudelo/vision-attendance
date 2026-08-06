/**
 * Estado que una Server Action devuelve a su formulario.
 *
 * Es el único contrato entre las acciones del panel y los componentes de cliente que las invocan
 * con `useActionState`, así que debe ser serializable: solo datos planos.
 */

import type { FieldErrors } from '@/server/academic/errors';

export interface FormState {
  status: 'idle' | 'success' | 'error';
  /** Mensaje en español para mostrar sobre el formulario. Vacío mientras nadie ha enviado nada. */
  message: string;
  /** Mensajes por campo, con el mismo nombre que el `name` del `input`. */
  fieldErrors: FieldErrors;
}

/** Estado inicial: ni éxito ni error, nada que mostrar. */
export const IDLE_FORM_STATE: FormState = { status: 'idle', message: '', fieldErrors: {} };

export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;
