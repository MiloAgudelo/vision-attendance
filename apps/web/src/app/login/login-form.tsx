'use client';

import { useActionState } from 'react';

import { loginAction } from './actions';
import { LOGIN_IDLE } from './form-state';

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (!messages?.[0]) return null;
  return (
    <span className="text-sm text-red-700 dark:text-red-300" role="alert">
      {messages[0]}
    </span>
  );
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, LOGIN_IDLE);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Correo institucional</span>
        <input
          autoComplete="email"
          autoFocus
          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-sky-600 focus:ring-3 focus:ring-sky-600/20 dark:border-slate-700 dark:bg-slate-900"
          inputMode="email"
          name="email"
          placeholder="nombre@uam.edu.co"
          required
          type="email"
        />
        <FieldError messages={state.fieldErrors.email} />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Contraseña</span>
        <input
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-sky-600 focus:ring-3 focus:ring-sky-600/20 dark:border-slate-700 dark:bg-slate-900"
          name="password"
          required
          type="password"
        />
        <FieldError messages={state.fieldErrors.password} />
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
        {pending ? 'Verificando acceso…' : 'Ingresar'}
      </button>
    </form>
  );
}
