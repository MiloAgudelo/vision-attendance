/**
 * Índice del panel: qué hay registrado y desde dónde se administra cada cosa.
 */

import Link from 'next/link';

import { listGroups } from '@/server/academic/groups';
import { listWeeklySchedule } from '@/server/academic/schedules';
import { listStudents } from '@/server/academic/students';
import { listSubjects } from '@/server/academic/subjects';

import { PageHeader, Panel } from '../_components/ui';
import { ADMIN_SECTIONS } from '../_lib/sections';

/** Los datos cambian en cada alta: la página se calcula en cada petición. */
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const [students, subjects, groups, slots] = await Promise.all([
    listStudents(),
    listSubjects(),
    listGroups(),
    listWeeklySchedule(),
  ]);

  const counters = [
    { label: 'Estudiantes activos', value: students.length, href: '/students' },
    { label: 'Materias activas', value: subjects.length, href: '/subjects' },
    { label: 'Grupos activos', value: groups.length, href: '/groups' },
    { label: 'Franjas de horario', value: slots.length, href: '/schedules' },
  ];

  return (
    <>
      <PageHeader
        description="Administración del dominio académico: estudiantes, materias, grupos, inscripciones y horarios."
        title="Panel de administración"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counters.map((counter) => (
          <Link
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            href={counter.href}
            key={counter.label}
          >
            <p className="text-2xl font-semibold tabular-nums">{counter.value}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">{counter.label}</p>
          </Link>
        ))}
      </div>

      <Panel title="Secciones">
        <ul className="space-y-3">
          {ADMIN_SECTIONS.filter((section) => section.href !== '/admin').map((section) => (
            <li key={section.href}>
              <Link
                className="text-sm font-medium underline-offset-4 hover:underline"
                href={section.href}
              >
                {section.label}
              </Link>
              <p className="text-sm text-slate-600 dark:text-slate-400">{section.description}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Estas pantallas todavía no exigen iniciar sesión. La autenticación con Supabase Auth y la
        autorización por rol llegan con la lane W5.
      </p>
    </>
  );
}
