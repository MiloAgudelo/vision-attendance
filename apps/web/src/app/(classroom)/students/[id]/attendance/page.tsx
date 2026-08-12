import Link from 'next/link';

import { requireAuthenticatedUser } from '@/app/_lib/auth/guards';

import { loadAccessibleStudentHistory } from '../../../_lib/access';
import { formatBogotaDate, formatBogotaTime } from '../../../_lib/format';

export const dynamic = 'force-dynamic';

export default async function StudentAttendanceHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireAuthenticatedUser();
  const { id } = await params;
  const { from } = await searchParams;
  const history = await loadAccessibleStudentHistory(id, user);

  return (
    <>
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-teal-800 uppercase dark:text-teal-300">
          Historial por estudiante
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
          Asistencias registradas
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {user.role === 'teacher'
            ? 'Solo se muestran sesiones de tus grupos.'
            : 'Historial completo de ingresos asociados a sesiones.'}
        </p>
        {from ? (
          <Link
            className="inline-flex min-h-11 items-center text-sm font-medium text-teal-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-teal-300"
            href={`/sessions/${from}`}
          >
            Volver a la sesión
          </Link>
        ) : (
          <Link
            className="inline-flex min-h-11 items-center text-sm font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-300"
            href="/sessions"
          >
            Volver a sesiones
          </Link>
        )}
      </header>

      {history.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Sin asistencias registradas en el alcance visible.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white/80 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/70">
          {history.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              key={item.attendanceId}
            >
              <div>
                <p className="font-medium">
                  {item.subjectCode} · {item.groupName}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {formatBogotaDate(item.sessionDate)} · ingreso{' '}
                  {formatBogotaTime(item.checkedInAt)}
                  {item.source === 'manual' ? ' (manual)' : ''}
                </p>
              </div>
              <Link
                className="text-sm font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-300"
                href={`/sessions/${item.id}`}
              >
                Ver sesión
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
