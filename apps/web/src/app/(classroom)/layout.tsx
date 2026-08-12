import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { requireAuthenticatedUser } from '@/app/_lib/auth/guards';

import { ClassroomNav } from './_components/classroom-nav';

export const metadata: Metadata = {
  title: 'Sesiones — Registro de asistencia RFID',
};

export default async function ClassroomLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();

  return (
    <div className="classroom-board min-h-dvh">
      <header className="border-b border-teal-900/10 bg-white/85 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link className="flex min-w-0 items-center gap-3" href="/sessions">
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
                  Tablero de aula · Visión de las Américas
                </span>
              </span>
            </Link>
          </div>

          <ClassroomNav fullName={user.fullName} role={user.role} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
