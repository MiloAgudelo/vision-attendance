import Link from 'next/link';

import { requireAuthenticatedUser } from '@/app/_lib/auth/guards';

import { listAccessibleSessions } from '../_lib/access';
import { formatBogotaDate, formatBogotaTime } from '../_lib/format';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const user = await requireAuthenticatedUser();
  const sessions = await listAccessibleSessions(user);

  return (
    <>
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-teal-800 uppercase dark:text-teal-300">
          Tablero de aula
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
          Sesiones de clase
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          {user.role === 'admin'
            ? 'Consulta todas las sesiones creadas por el motor de asistencia.'
            : 'Solo ves las sesiones de los grupos que tienes asignados.'}
        </p>
      </header>

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
          Todavía no hay sesiones. Se crean al primer escaneo dentro de la ventana del horario.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white/80 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/70">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-teal-50/80 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-700 dark:hover:bg-slate-900"
                href={`/sessions/${session.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-950 dark:text-slate-50">
                    {session.subjectCode} · {session.groupName}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {session.subjectName}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="tabular-nums text-slate-900 dark:text-slate-100">
                    {formatBogotaDate(session.sessionDate)}
                  </p>
                  <p className="tabular-nums text-slate-500 dark:text-slate-400">
                    {formatBogotaTime(session.scheduledStart)} –{' '}
                    {formatBogotaTime(session.scheduledEnd)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
