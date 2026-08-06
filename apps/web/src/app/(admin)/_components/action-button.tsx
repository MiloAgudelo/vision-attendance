'use client';

/**
 * Botón que ejecuta una Server Action sobre una fila concreta (dar de baja, reactivar, retirar,
 * eliminar una franja).
 *
 * Usa `useActionState` como el resto de formularios del panel para que un error de negocio se lea
 * junto al botón, en español, en vez de tumbar la página con una pantalla de error.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { IDLE_FORM_STATE, type FormAction } from '../_lib/form-state';

const TONES = {
  neutral:
    'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
  danger:
    'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950',
} as const;

export type ActionTone = keyof typeof TONES;

function Button({ label, tone }: { label: string; tone: ActionTone }) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${TONES[tone]}`}
      disabled={pending}
      type="submit"
    >
      {pending ? '…' : label}
    </button>
  );
}

export function ActionButton({
  action,
  label,
  values,
  tone = 'neutral',
  confirm,
}: {
  action: FormAction;
  label: string;
  /** Campos ocultos que identifican la fila afectada. */
  values: Record<string, string>;
  tone?: ActionTone;
  /** Texto de confirmación del navegador para las acciones destructivas. */
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(event) => {
        if (confirm !== undefined && !globalThis.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(values).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}

      <Button label={label} tone={tone} />

      {state.status === 'error' ? (
        <span className="text-xs text-red-600 dark:text-red-400">{state.message}</span>
      ) : null}
    </form>
  );
}
