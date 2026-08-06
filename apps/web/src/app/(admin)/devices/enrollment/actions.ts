'use server';

/**
 * Server action del enrolamiento de carnets.
 *
 * Sin autenticación todavía (login y roles son de la lane W5): W5 pondrá esta pantalla detrás de
 * autorización de administrador.
 */

import { revalidatePath } from 'next/cache';

import { BusinessRuleError } from '@/server/devices/errors';
import { assignCardToStudent } from '@/server/enrollment/enrollment';

import type { ActionState } from '../form-state';

const ENROLLMENT_PATH = '/devices/enrollment';

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value : '';
}

/** Asocia un UID capturado a un estudiante existente. */
export async function assignCardAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const assigned = await assignCardToStudent({
      cardId: text(formData, 'cardId'),
      studentId: text(formData, 'studentId'),
    });

    revalidatePath(ENROLLMENT_PATH);
    return {
      status: 'success',
      message: `El carnet ${assigned.uid} quedó asociado a ${assigned.studentName} (${assigned.studentCode}).`,
    };
  } catch (error) {
    if (error instanceof BusinessRuleError) return { status: 'error', message: error.message };
    throw error;
  }
}
