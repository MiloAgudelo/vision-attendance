'use client';

/** Selector de estudiante para asociar un UID capturado, con su mensaje de resultado. */

import { useActionState } from 'react';

import type { AssignableStudent } from '@/server/enrollment/enrollment';

import { IDLE } from '../form-state';
import { assignCardAction } from './actions';

export interface AssignCardFormProps {
  cardId: string;
  cardUid: string;
  students: AssignableStudent[];
}

export function AssignCardForm({ cardId, cardUid, students }: AssignCardFormProps) {
  const [state, formAction, pending] = useActionState(assignCardAction, IDLE);
  const selectId = `student-${cardId}`;

  if (students.length === 0) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        No hay estudiantes activos a los que asociar el carnet.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="cardId" value={cardId} />

        <label className="sr-only" htmlFor={selectId}>
          Estudiante para el carnet {cardUid}
        </label>
        <select
          id={selectId}
          name="studentId"
          required
          defaultValue=""
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="" disabled>
            Elige un estudiante…
          </option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName} ({student.studentCode})
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {pending ? 'Asociando…' : 'Asociar'}
        </button>
      </form>

      {state.status !== 'idle' ? (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={
            state.status === 'error'
              ? 'text-xs text-red-700 dark:text-red-400'
              : 'text-xs text-emerald-700 dark:text-emerald-400'
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
