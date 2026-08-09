/** Grupos: listado y alta. Las inscripciones y el horario se gestionan dentro de cada grupo. */

import Link from 'next/link';

import { listGroups, listTeachers, DEFAULT_SESSION_WINDOW_MINUTES } from '@/server/academic/groups';
import { listSubjects } from '@/server/academic/subjects';

import { ActionButton } from '../_components/action-button';
import { EntityForm } from '../_components/entity-form';
import { EmptyState, PageHeader, Panel, StatusBadge, Table, Td, Th } from '../_components/ui';

import { activateGroupAction, createGroupAction, deactivateGroupAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ inactivos?: string }>;
}) {
  const { inactivos } = await searchParams;
  const includeInactive = inactivos === '1';

  const [groups, subjects, teachers] = await Promise.all([
    listGroups({ includeInactive }),
    listSubjects(),
    listTeachers(),
  ]);

  return (
    <>
      <PageHeader
        actions={
          <Link
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            href={includeInactive ? '/groups' : '/groups?inactivos=1'}
          >
            {includeInactive ? 'Ver solo activos' : 'Incluir dados de baja'}
          </Link>
        }
        description="Cada grupo pertenece a una materia y a un periodo. Sus inscritos y su horario se administran dentro del grupo."
        title="Grupos"
      />

      <Panel
        description="No puede haber dos grupos con el mismo nombre en la misma materia y el mismo periodo."
        title="Crear un grupo"
      >
        {subjects.length === 0 ? (
          <EmptyState>Primero hay que registrar una materia en la sección «Materias».</EmptyState>
        ) : (
          <EntityForm
            action={createGroupAction}
            columns={2}
            fields={[
              {
                kind: 'select',
                name: 'subjectId',
                label: 'Materia',
                options: subjects.map((subject) => ({
                  value: subject.id,
                  label: `${subject.code} — ${subject.name}`,
                })),
                placeholder: 'Selecciona una materia',
                required: true,
              },
              {
                kind: 'text',
                name: 'name',
                label: 'Nombre del grupo',
                placeholder: 'G1',
                required: true,
              },
              {
                kind: 'text',
                name: 'term',
                label: 'Periodo académico',
                placeholder: '2026-2',
                required: true,
              },
              {
                kind: 'select',
                name: 'teacherId',
                label: 'Profesor (opcional)',
                options: teachers.map((teacher) => ({
                  value: teacher.id,
                  label: teacher.fullName,
                })),
                placeholder: 'Sin asignar',
              },
              {
                kind: 'number',
                name: 'sessionWindowMinutes',
                label: 'Ventana de sesión (minutos)',
                defaultValue: String(DEFAULT_SESSION_WINDOW_MINUTES),
                hint: 'Minutos antes de la hora de inicio en los que un escaneo ya cuenta para la clase (RN2).',
                min: 0,
                max: 720,
              },
            ]}
            resetOnSuccess
            submitLabel="Crear grupo"
          />
        )}
      </Panel>

      <Panel title={`Listado (${groups.length})`}>
        {groups.length === 0 ? (
          <EmptyState>Todavía no hay grupos.</EmptyState>
        ) : (
          <Table
            head={
              <tr>
                <Th>Materia</Th>
                <Th>Grupo</Th>
                <Th>Periodo</Th>
                <Th>Profesor</Th>
                <Th>Ventana</Th>
                <Th>Inscritos</Th>
                <Th>Franjas</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            }
          >
            {groups.map((group) => (
              <tr key={group.id}>
                <Td>
                  <span className="font-mono text-xs">{group.subjectCode}</span>
                </Td>
                <Td>
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    href={`/groups/${group.id}`}
                  >
                    {group.name}
                  </Link>
                </Td>
                <Td>{group.term}</Td>
                <Td>{group.teacherName ?? '—'}</Td>
                <Td>
                  <span className="tabular-nums">{group.sessionWindowMinutes} min</span>
                </Td>
                <Td>
                  <span className="tabular-nums">{group.enrolledCount}</span>
                </Td>
                <Td>
                  <span className="tabular-nums">{group.scheduleCount}</span>
                </Td>
                <Td>
                  <StatusBadge status={group.status} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    <Link
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      href={`/groups/${group.id}`}
                    >
                      Abrir
                    </Link>

                    {group.status === 'active' ? (
                      <ActionButton
                        action={deactivateGroupAction}
                        confirm={`¿Dar de baja el grupo ${group.name}? Sus inscripciones se conservan.`}
                        label="Dar de baja"
                        tone="danger"
                        values={{ id: group.id }}
                      />
                    ) : (
                      <ActionButton
                        action={activateGroupAction}
                        label="Reactivar"
                        values={{ id: group.id }}
                      />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
