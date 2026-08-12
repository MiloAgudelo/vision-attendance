'use client';

import { useActionState } from 'react';

import type { SessionRosterStudent } from '@/server/attendance/queries';

import { correctAttendanceAction, type CorrectionFormState } from '../sessions/[id]/actions';

const IDLE: CorrectionFormState = { status: 'idle', message: null, fieldErrors: {} };

export function CorrectionForm({
  sessionId,
  students,
}: {
  sessionId: string;
  students: SessionRosterStudent[];
}) {
  const [state, formAction, pending] = useActionState(correctAttendanceAction, IDLE);

  return (
    <form action={formAction} className="space-y-4">
      <input name="sessionId" type="hidden" value={sessionId} />

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Estudiante</span>
        <select
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-teal-700 focus:ring-3 focus:ring-teal-700/20 dark:border-slate-700 dark:bg-slate-950"
          name="studentId"
          required
        >
          <option value="">Selecciona un estudiante</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName} ({student.studentCode})
              {student.present ? ' — presente' : ' — ausente'}
            </option>
          ))}
        </select>
        {state.fieldErrors.studentId?.[0] ? (
          <span className="text-sm text-red-700" role="alert">
            {state.fieldErrors.studentId[0]}
          </span>
        ) : null}
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Corrección</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input defaultChecked name="present" type="radio" value="true" />
          Marcar presente
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="present" type="radio" value="false" />
          Marcar ausente
        </label>
      </fieldset>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Motivo</span>
        <textarea
          className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-teal-700 focus:ring-3 focus:ring-teal-700/20 dark:border-slate-700 dark:bg-slate-950"
          maxLength={500}
          name="reason"
          required
        />
        {state.fieldErrors.reason?.[0] ? (
          <span className="text-sm text-red-700" role="alert">
            {state.fieldErrors.reason[0]}
          </span>
        ) : null}
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Notas (opcional)</span>
        <input
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-teal-700 focus:ring-3 focus:ring-teal-700/20 dark:border-slate-700 dark:bg-slate-950"
          maxLength={500}
          name="notes"
          type="text"
        />
      </label>

      {state.message ? (
        <p
          className={`rounded-lg px-4 py-3 text-sm ${
            state.status === 'success'
              ? 'border border-teal-200 bg-teal-50 text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100'
              : 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200'
          }`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="min-h-11 rounded-lg bg-teal-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Guardando corrección…' : 'Guardar corrección'}
      </button>
    </form>
  );
}
