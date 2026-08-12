import Link from 'next/link';

import { requireAuthenticatedUser } from '@/app/_lib/auth/guards';
import { listSessionCorrections } from '@/server/attendance/queries';

import { CorrectionForm } from '../../_components/correction-form';
import { LivePoller } from '../../_components/live-poller';
import { RosterBoard } from '../../_components/roster-board';
import { loadAccessibleSessionRoster } from '../../_lib/access';
import { formatBogotaDate, formatBogotaDateTime, formatBogotaTime } from '../../_lib/format';

export const dynamic = 'force-dynamic';

export default async function SessionLivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthenticatedUser();
  const { id } = await params;
  const roster = await loadAccessibleSessionRoster(id, user);
  const corrections = user.role === 'admin' ? await listSessionCorrections(roster.session.id) : [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <header className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-800 uppercase dark:text-teal-300">
            Sesión en vivo
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
            {roster.session.subjectCode} · {roster.session.groupName}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {roster.session.subjectName} · {formatBogotaDate(roster.session.sessionDate)} ·{' '}
            {formatBogotaTime(roster.session.scheduledStart)} –{' '}
            {formatBogotaTime(roster.session.scheduledEnd)}
          </p>
          <LivePoller />
        </header>

        <Link
          className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:text-slate-200"
          href="/sessions"
        >
          Volver a sesiones
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <RosterBoard sessionId={roster.session.id} students={roster.students} />
      </section>

      {user.role === 'admin' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/70">
            <h2 className="text-base font-semibold">Corrección manual</h2>
            <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-400">
              Solo administración. El actor queda registrado desde tu sesión autenticada.
            </p>
            <CorrectionForm sessionId={roster.session.id} students={roster.students} />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/70">
            <h2 className="text-base font-semibold">Historial de correcciones</h2>
            {corrections.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sin correcciones en esta sesión.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {corrections.map((correction) => (
                  <li className="py-3 text-sm" key={correction.id}>
                    <p className="font-medium">
                      {correction.studentName} · {correction.action}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">{correction.reason}</p>
                    <p className="text-xs text-slate-500">
                      {formatBogotaDateTime(correction.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
