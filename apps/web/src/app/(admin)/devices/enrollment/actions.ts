'use server';

/**
 * Server action del enrolamiento de carnets.
 *
 * La autorización también vive en la action para impedir mutaciones directas por fuera del layout.
 */

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/app/_lib/auth/guards';
import { assignCardToStudent } from '@/server/devices/enrollment';
import { BusinessRuleError } from '@/server/devices/errors';

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
  await requireRole('admin');
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
