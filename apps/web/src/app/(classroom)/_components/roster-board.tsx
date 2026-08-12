import Link from 'next/link';

import type { SessionRosterStudent } from '@/server/attendance/queries';

import { formatBogotaTime, formatMinutesFromStart } from '../_lib/format';
import { splitRoster } from '../_lib/roster-view';

function StudentRow({
  student,
  sessionId,
  showHistoryLink,
}: {
  student: SessionRosterStudent;
  sessionId: string;
  showHistoryLink: boolean;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 py-3 last:border-b-0 dark:border-slate-800">
      <div className="min-w-0">
        <p className="font-medium text-slate-900 dark:text-slate-50">{student.fullName}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{student.studentCode}</p>
      </div>
      <div className="text-right text-sm">
        {student.present ? (
          <>
            <p className="tabular-nums text-teal-900 dark:text-teal-300">
              {student.checkedInAt ? formatBogotaTime(student.checkedInAt) : '—'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatMinutesFromStart(student.minutesFromStart)}
              {student.source === 'manual' ? ' · manual' : null}
            </p>
          </>
        ) : (
          <p className="text-amber-900 dark:text-amber-200">Ausente</p>
        )}
        {showHistoryLink ? (
          <Link
            className="mt-1 inline-block text-xs font-medium text-teal-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-teal-300"
            href={`/students/${student.id}/attendance?from=${sessionId}`}
          >
            Historial
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function RosterBoard({
  students,
  sessionId,
}: {
  students: SessionRosterStudent[];
  sessionId: string;
}) {
  const columns = splitRoster(students);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-teal-950 px-4 py-3 text-teal-50">
          <dt className="text-xs tracking-wide uppercase opacity-80">Presentes</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{columns.presentCount}</dd>
        </div>
        <div className="rounded-lg bg-amber-100 px-4 py-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <dt className="text-xs tracking-wide uppercase opacity-80">Ausentes</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{columns.absentCount}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <dt className="text-xs tracking-wide text-slate-500 uppercase">Inscritos</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{columns.total}</dd>
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="presentes-heading">
          <h2
            className="text-sm font-semibold tracking-wide text-teal-900 uppercase dark:text-teal-300"
            id="presentes-heading"
          >
            Presentes
          </h2>
          {columns.present.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Todavía no hay ingresos registrados.</p>
          ) : (
            <ul className="mt-2">
              {columns.present.map((student) => (
                <StudentRow
                  key={student.id}
                  sessionId={sessionId}
                  showHistoryLink
                  student={student}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ausentes-heading">
          <h2
            className="text-sm font-semibold tracking-wide text-amber-900 uppercase dark:text-amber-200"
            id="ausentes-heading"
          >
            Ausentes
          </h2>
          {columns.absent.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Todos los inscritos ya registraron ingreso.
            </p>
          ) : (
            <ul className="mt-2">
              {columns.absent.map((student) => (
                <StudentRow
                  key={student.id}
                  sessionId={sessionId}
                  showHistoryLink
                  student={student}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
