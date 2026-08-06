'use server';

/**
 * Server Actions del grupo: sus datos, sus inscripciones y su horario.
 *
 * Inscripciones y horarios no tienen sección propia: se gestionan desde la pantalla del grupo
 * (`docs/agent-playbook.md` §4, W1).
 */

import { revalidatePath } from 'next/cache';

import { enrollStudent, withdrawStudent } from '@/server/academic/enrollments';
import { activateGroup, createGroup, deactivateGroup, updateGroup } from '@/server/academic/groups';
import { addSchedule, removeSchedule } from '@/server/academic/schedules';

import { readOptionalText, readText, runFormAction } from '../_lib/form-action';
import type { FormState } from '../_lib/form-state';

function refresh(groupId?: string): void {
  revalidatePath('/groups');
  revalidatePath('/schedules');
  revalidatePath('/admin');
  if (groupId) revalidatePath(`/groups/${groupId}`);
}

/** Campos comunes del alta y la edición de un grupo. */
function readGroupInput(formData: FormData) {
  return {
    subjectId: readText(formData, 'subjectId'),
    name: readText(formData, 'name'),
    term: readText(formData, 'term'),
    teacherId: readOptionalText(formData, 'teacherId') ?? null,
    sessionWindowMinutes: readOptionalText(formData, 'sessionWindowMinutes'),
  };
}

export async function createGroupAction(_state: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const group = await createGroup(readGroupInput(formData));

    refresh(group.id);
    return `Se creó el grupo ${group.name} de ${group.subjectCode}.`;
  });
}

export async function updateGroupAction(_state: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    await updateGroup(id, readGroupInput(formData));

    refresh(id);
    return 'Se guardaron los cambios del grupo.';
  });
}

export async function deactivateGroupAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    const group = await deactivateGroup(id);

    refresh(id);
    return `Se dio de baja el grupo ${group.name}.`;
  });
}

export async function activateGroupAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const id = readText(formData, 'id');
    const group = await activateGroup(id);

    refresh(id);
    return `Se reactivó el grupo ${group.name}.`;
  });
}

/* -------------------------------------------------------------------------- */
/* Inscripciones                                                               */
/* -------------------------------------------------------------------------- */

export async function enrollStudentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const groupId = readText(formData, 'groupId');
    const enrollment = await enrollStudent({
      groupId,
      studentId: readText(formData, 'studentId'),
    });

    refresh(groupId);
    return `Se inscribió a ${enrollment.studentName}.`;
  });
}

/** Retirar es una baja lógica: la inscripción se conserva con `status = 'inactive'`. */
export async function withdrawStudentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const groupId = readText(formData, 'groupId');
    const enrollment = await withdrawStudent({
      groupId,
      studentId: readText(formData, 'studentId'),
    });

    refresh(groupId);
    return `Se retiró a ${enrollment.studentName} del grupo.`;
  });
}

/* -------------------------------------------------------------------------- */
/* Horario                                                                     */
/* -------------------------------------------------------------------------- */

export async function addScheduleAction(_state: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const groupId = readText(formData, 'groupId');
    await addSchedule({
      groupId,
      weekday: readText(formData, 'weekday'),
      startTime: readText(formData, 'startTime'),
      endTime: readText(formData, 'endTime'),
      room: readOptionalText(formData, 'room') ?? null,
    });

    refresh(groupId);
    return 'Se añadió la franja al horario del grupo.';
  });
}

export async function removeScheduleAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const groupId = readText(formData, 'groupId');
    await removeSchedule(readText(formData, 'id'));

    refresh(groupId);
    return 'Se retiró la franja del horario.';
  });
}
