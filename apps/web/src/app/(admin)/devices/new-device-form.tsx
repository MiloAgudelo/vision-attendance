'use client';

/**
 * Alta de un dispositivo.
 *
 * El único motivo de que sea un componente de cliente es la credencial: hay que mostrarla al
 * administrador **una sola vez**, justo después del alta, y para eso hace falta conservar el
 * resultado de la server action en el estado del formulario.
 */

import { useActionState } from 'react';

import { createDeviceAction } from './actions';
import { CREATE_DEVICE_IDLE } from './form-state';

export function NewDeviceForm() {
  const [state, formAction, pending] = useActionState(createDeviceAction, CREATE_DEVICE_IDLE);

  return (
    <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="text-lg font-semibold">Registrar un dispositivo</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        El nombre viaja dentro de la credencial del lector, así que solo admite letras, dígitos y
        guiones (por ejemplo <code>LAB-DESARROLLO-01</code>).
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Nombre</span>
          <input
            name="name"
            required
            maxLength={120}
            pattern="[A-Za-z0-9\-]+"
            placeholder="LAB-DESARROLLO-01"
            className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Salón (opcional)</span>
          <input
            name="room"
            maxLength={120}
            placeholder="Bloque A - 301"
            className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {pending ? 'Registrando…' : 'Registrar'}
        </button>
      </form>

      {state.status === 'error' ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      ) : null}

      {state.status === 'success' && state.apiKey ? (
        <div className="mt-4 rounded-md border border-amber-400 bg-amber-50 p-4 dark:border-amber-500/60 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Copia ahora la credencial de «{state.deviceName}»: no se puede volver a mostrar.
          </p>
          <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
            En la base de datos solo queda su hash SHA-256. Si se pierde, hay que revocar el
            dispositivo y registrarlo otra vez.
          </p>
          <code className="mt-3 block overflow-x-auto rounded bg-white p-3 font-mono text-sm break-all dark:bg-slate-900">
            {state.apiKey}
          </code>
          <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
            Úsala como <code>Authorization: Bearer &lt;credencial&gt;</code> al llamar a{' '}
            <code>POST /api/v1/events</code>.
          </p>
        </div>
      ) : null}
    </section>
  );
}
