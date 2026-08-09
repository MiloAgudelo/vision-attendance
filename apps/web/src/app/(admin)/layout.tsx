/**
 * Armazón del panel de administración.
 *
 * Es el layout común de todas las pantallas de administración. **No hay autenticación todavía**:
 * el login con Supabase Auth y la autorización por rol son de la lane W5, que pondrá este mismo
 * armazón detrás de una sesión de administrador (`docs/agent-playbook.md` §4).
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminNav } from './_components/admin-nav';

export const metadata: Metadata = {
  title: 'Administración — Registro de asistencia RFID',
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link className="text-sm font-semibold tracking-tight" href="/admin">
              Registro de asistencia RFID · Administración
            </Link>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Institución Universitaria Visión de las Américas
            </p>
          </div>

          <AdminNav />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
