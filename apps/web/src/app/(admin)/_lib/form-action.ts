/**
 * Utilidades del lado del servidor para las Server Actions del panel.
 *
 * Toda mutación de la interfaz pasa por aquí: lee el `FormData`, delega en `src/server/academic/`
 * y traduce el fallo de negocio a un {@link FormState} en vez de reventar con una pantalla de error
 * (`docs/architecture.md` §6).
 */

import { requireRole } from '@/app/_lib/auth/guards';
import { isDomainError } from '@/server/academic/errors';

import type { FormState } from './form-state';

/**
 * Ejecuta una operación de dominio y devuelve el estado del formulario.
 *
 * Solo captura errores de negocio: un fallo de infraestructura sigue subiendo, y también lo hace la
 * excepción de control con la que Next.js implementa `redirect()`.
 */
export async function runFormAction(run: () => Promise<string>): Promise<FormState> {
  await requireRole('admin');
  try {
    return { status: 'success', message: await run(), fieldErrors: {} };
  } catch (error) {
    if (isDomainError(error)) {
      return { status: 'error', message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
}

/** Lee un campo de texto del formulario. Los campos ausentes se tratan como cadena vacía. */
export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Lee un campo opcional: devuelve `undefined` si viene vacío.
 *
 * Así un `select` sin elegir o un número en blanco dejan que actúe el valor por defecto del
 * esquema Zod en vez de llegar como cadena vacía.
 */
export function readOptionalText(formData: FormData, name: string): string | undefined {
  const value = readText(formData, name).trim();
  return value === '' ? undefined : value;
}
