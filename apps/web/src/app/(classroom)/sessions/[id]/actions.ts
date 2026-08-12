'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/app/_lib/auth/guards';
import { correctAttendance } from '@/server/attendance/corrections';
import { isAttendanceError } from '@/server/attendance/errors';

export interface CorrectionFormState {
  status: 'idle' | 'success' | 'error';
  message: string | null;
  fieldErrors: Record<string, string[]>;
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Corrige asistencia. El `userId` del actor sale de `requireRole('admin')`,
 * nunca de FormData ni de parámetros del cliente.
 */
export async function correctAttendanceAction(
  _prev: CorrectionFormState,
  formData: FormData,
): Promise<CorrectionFormState> {
  const admin = await requireRole('admin');

  // Defensa en profundidad: ignorar cualquier userId enviado por el cliente.
  formData.delete('userId');

  const sessionId = readText(formData, 'sessionId').trim();
  const studentId = readText(formData, 'studentId').trim();
  const reason = readText(formData, 'reason').trim();
  const notes = readText(formData, 'notes').trim();
  const presentRaw = readText(formData, 'present');

  const fieldErrors: Record<string, string[]> = {};
  if (!sessionId) fieldErrors.sessionId = ['La sesión es obligatoria.'];
  if (!studentId) fieldErrors.studentId = ['Selecciona un estudiante.'];
  if (!reason) fieldErrors.reason = ['El motivo es obligatorio.'];
  if (presentRaw !== 'true' && presentRaw !== 'false') {
    fieldErrors.present = ['Indica si marcas presente o ausente.'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Revisa los campos del formulario.', fieldErrors };
  }

  try {
    const result = await correctAttendance({
      sessionId,
      studentId,
      userId: admin.id,
      present: presentRaw === 'true',
      reason,
      notes: notes || null,
    });

    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath('/sessions');

    const actionLabel =
      result.action === 'mark_absent'
        ? 'Marcado como ausente'
        : result.action === 'mark_present'
          ? 'Marcado como presente'
          : 'Asistencia actualizada';

    return {
      status: 'success',
      message: `${actionLabel}. La corrección quedó auditada.`,
      fieldErrors: {},
    };
  } catch (error) {
    if (isAttendanceError(error)) {
      return { status: 'error', message: error.message, fieldErrors: {} };
    }
    throw error;
  }
}
