/**
 * Horarios: vista de consulta del horario semanal de todos los grupos.
 *
 * Es solo lectura a propósito. Cada franja se crea y se retira desde la pantalla de su grupo, que
 * es donde el administrador tiene el contexto para hacerlo.
 */

import Link from 'next/link';

import { WEEKDAYS, listWeeklySchedule } from '@/server/academic/schedules';

import { EmptyState, PageHeader, Panel } from '../_components/ui';

export const dynamic = 'force-dynamic';

function shortTime(value: string): string {
  return value.slice(0, 5);
}

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ inactivos?: string }>;
}) {
  const { inactivos } = await searchParams;
  const includeInactiveGroups = inactivos === '1';

  const slots = await listWeeklySchedule({ includeInactiveGroups });

  return (
    <>
      <PageHeader
        actions={
          <Link
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            href={includeInactiveGroups ? '/schedules' : '/schedules?inactivos=1'}
          >
            {includeInactiveGroups ? 'Ver solo grupos activos' : 'Incluir grupos dados de baja'}
          </Link>
        }
        description="Horario semanal en hora local de Bogotá. Para editarlo, entra en la pantalla del grupo."
        title="Horarios"
      />

      {slots.length === 0 ? (
        <Panel>
          <EmptyState>
            Todavía no hay franjas de horario. Se añaden desde la pantalla de cada grupo.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WEEKDAYS.map((day) => {
            const ofDay = slots.filter((slot) => slot.weekday === day.iso);

            return (
              <Panel key={day.iso} title={day.label}>
                {ofDay.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Sin clases.</p>
                ) : (
                  <ul className="space-y-3">
                    {ofDay.map((slot) => (
                      <li key={slot.id}>
                        <p className="text-sm font-medium tabular-nums">
                          {shortTime(slot.startTime)} – {shortTime(slot.endTime)}
                        </p>
                        <p className="text-sm">
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={`/groups/${slot.groupId}`}
                          >
                            {slot.subjectCode} · {slot.groupName}
                          </Link>{' '}
                          <span className="text-slate-500 dark:text-slate-400">
                            ({slot.groupTerm})
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {slot.subjectName}
                          {slot.room ? ` · ${slot.room}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
