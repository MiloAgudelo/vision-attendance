'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { updatePasswordAction } from './actions';
import { UPDATE_PASSWORD_IDLE } from './form-state';

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.[0]) return null;
  return (
    <span className="text-sm text-red-700 dark:text-red-300" role="alert">
      {messages[0]}
    </span>
  );
}

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, UPDATE_PASSWORD_IDLE);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Nueva contraseña</span>
        <input
          autoComplete="new-password"
          autoFocus
          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-sky-600 focus:ring-3 focus:ring-sky-600/20 dark:border-slate-700 dark:bg-slate-900"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <FieldError messages={state.fieldErrors.password} />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Confirmar contraseña</span>
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-sky-600 focus:ring-3 focus:ring-sky-600/20 dark:border-slate-700 dark:bg-slate-900"
          minLength={8}
          name="confirm"
          required
          type="password"
        />
        <FieldError messages={state.fieldErrors.confirm} />
      </label>

      {state.message ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-wait disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Guardando…' : 'Guardar contraseña'}
      </button>

      <p className="text-center text-sm text-slate-500">
        <Link className="font-medium text-sky-800 hover:underline dark:text-sky-300" href="/login">
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
