/**
 * Armazón del panel de administración.
 *
 * Es el layout común de todas las pantallas de administración y exige una sesión con rol
 * `admin` antes de consultar o mostrar datos.
 */

import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { requireRole } from '@/app/_lib/auth/guards';
import { logoutAction } from '@/app/login/actions';

import { AdminNav } from './_components/admin-nav';

export const metadata: Metadata = {
  title: 'Administración — Registro de asistencia RFID',
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole('admin');

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link className="flex min-w-0 items-center gap-3" href="/admin">
              <Image
                alt=""
                aria-hidden
                className="rounded-lg border border-slate-200 bg-white object-contain p-1 dark:border-slate-700"
                height={44}
                src="/logo-institucional.png"
                width={44}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight">
                  Registro de asistencia RFID
                </span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  Administración
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{user.fullName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Administrador</p>
              </div>
              <form action={logoutAction}>
                <button
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  type="submit"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>

          <AdminNav />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
