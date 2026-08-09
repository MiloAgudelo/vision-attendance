'use server';

/** Server Actions de materias. Delegan en `src/server/academic/subjects.ts`. */

import { revalidatePath } from 'next/cache';

import {
  activateSubject,
  createSubject,
  deactivateSubject,
  updateSubject,
} from '@/server/academic/subjects';

import { readText, runFormAction } from '../_lib/form-action';
import type { FormState } from '../_lib/form-state';

function refresh(id?: string): void {
  revalidatePath('/subjects');
  revalidatePath('/groups');
  revalidatePath('/admin');
  if (id) revalidatePath(`/subjects/${id}`);
}

export async function createSubjectAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const subject = await createSubject({
      code: readText(formData, 'code'),
      name: readText(formData, 'name'),
    });

    refresh();
    return `Se registró la materia ${subject.code}.`;
  });
}

export async function updateSubjectAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    await updateSubject(id, {
      code: readText(formData, 'code'),
      name: readText(formData, 'name'),
    });

    refresh(id);
    return 'Se guardaron los cambios de la materia.';
  });
}

export async function deactivateSubjectAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    const subject = await deactivateSubject(id);

    refresh(id);
    return `Se dio de baja la materia ${subject.code}.`;
  });
}

export async function activateSubjectAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    const subject = await activateSubject(id);

    refresh(id);
    return `Se reactivó la materia ${subject.code}.`;
  });
}
