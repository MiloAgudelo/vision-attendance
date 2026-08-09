'use server';

/**
 * Server Actions de estudiantes.
 *
 * Ninguna de ellas toca Drizzle: delegan en `src/server/academic/students.ts`
 * (`docs/architecture.md` §6).
 */

import { revalidatePath } from 'next/cache';

import {
  activateStudent,
  createStudent,
  deactivateStudent,
  updateStudent,
} from '@/server/academic/students';

import { readText, runFormAction } from '../_lib/form-action';
import type { FormState } from '../_lib/form-state';

function refresh(id?: string): void {
  revalidatePath('/students');
  revalidatePath('/admin');
  if (id) revalidatePath(`/students/${id}`);
}

export async function createStudentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const student = await createStudent({
      studentCode: readText(formData, 'studentCode'),
      fullName: readText(formData, 'fullName'),
    });

    refresh();
    return `Se registró a ${student.fullName}.`;
  });
}

export async function updateStudentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    await updateStudent(id, {
      studentCode: readText(formData, 'studentCode'),
      fullName: readText(formData, 'fullName'),
    });

    refresh(id);
    return 'Se guardaron los cambios del estudiante.';
  });
}

/** Baja lógica: la fila se conserva y deja de aparecer en los listados. */
export async function deactivateStudentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    const student = await deactivateStudent(id);

    refresh(id);
    return `Se dio de baja a ${student.fullName}.`;
  });
}

export async function activateStudentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    const student = await activateStudent(id);

    refresh(id);
    return `Se reactivó a ${student.fullName}.`;
  });
}
