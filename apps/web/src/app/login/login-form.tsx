'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { createSupabaseBrowserClient } from '@/app/_lib/supabase/browser';
import {
  completeAuthCallback,
  hasAuthCallbackPayload,
} from '@/app/_lib/supabase/complete-callback';

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
  const router = useRouter();
  const [state, formAction, pending] = useActionState(loginAction, LOGIN_IDLE);
  const [recovery, setRecovery] = useState<'idle' | 'working' | 'error'>('idle');
  const [recoveryMessage, setRecoveryMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!hasAuthCallbackPayload(window.location.href)) return;

    const run = async () => {
      setRecovery('working');
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setRecovery('error');
        setRecoveryMessage(
          'El inicio de sesión no está configurado. Comunícate con el administrador.',
        );
        return;
      }

      const result = await completeAuthCallback(supabase, window.location.href);
      if (!result.ok) {
        setRecovery('error');
        setRecoveryMessage(result.message);
        window.history.replaceState(null, '', '/login');
        return;
      }

      window.history.replaceState(null, '', result.next);
      router.replace(result.next);
    };

    void run();
  }, [router]);

  if (recovery === 'working') {
    return (
      <p className="mt-8 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Validando el enlace de recuperación…
      </p>
    );
  }

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

      {recoveryMessage || state.message ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {recoveryMessage ?? state.message}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-wait disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Verificando acceso…' : 'Ingresar'}
      </button>

      <p className="text-center text-sm text-slate-500">
        <Link
          className="font-medium text-sky-800 hover:underline dark:text-sky-300"
          href="/login/recover"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}
