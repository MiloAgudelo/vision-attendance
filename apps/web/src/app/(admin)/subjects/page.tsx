/** Materias: listado, alta y baja. */

import Link from 'next/link';

import { listSubjects } from '@/server/academic/subjects';

import { ActionButton } from '../_components/action-button';
import { EntityForm } from '../_components/entity-form';
import { EmptyState, PageHeader, Panel, StatusBadge, Table, Td, Th } from '../_components/ui';

import { activateSubjectAction, createSubjectAction, deactivateSubjectAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ inactivas?: string }>;
}) {
  const { inactivas } = await searchParams;
  const includeInactive = inactivas === '1';

  const subjects = await listSubjects({ includeInactive });

  return (
    <>
      <PageHeader
        actions={
          <Link
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            href={includeInactive ? '/subjects' : '/subjects?inactivas=1'}
          >
            {includeInactive ? 'Ver solo activas' : 'Incluir dadas de baja'}
          </Link>
        }
        description="Catálogo de materias sobre el que se abren los grupos."
        title="Materias"
      />

      <Panel
        description="El código de la materia no se puede repetir."
        title="Registrar una materia"
      >
        <EntityForm
          action={createSubjectAction}
          columns={2}
          fields={[
            {
              kind: 'text',
              name: 'code',
              label: 'Código',
              placeholder: 'LAB-DES',
              required: true,
            },
            {
              kind: 'text',
              name: 'name',
              label: 'Nombre',
              placeholder: 'Laboratorio de Desarrollo',
              required: true,
            },
          ]}
          resetOnSuccess
          submitLabel="Registrar materia"
        />
      </Panel>

      <Panel title={`Listado (${subjects.length})`}>
        {subjects.length === 0 ? (
          <EmptyState>Todavía no hay materias registradas.</EmptyState>
        ) : (
          <Table
            head={
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            }
          >
            {subjects.map((subject) => (
              <tr key={subject.id}>
                <Td>
                  <span className="font-mono text-xs">{subject.code}</span>
                </Td>
                <Td>{subject.name}</Td>
                <Td>
                  <StatusBadge status={subject.status} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    <Link
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      href={`/subjects/${subject.id}`}
                    >
                      Editar
                    </Link>

                    {subject.status === 'active' ? (
                      <ActionButton
                        action={deactivateSubjectAction}
                        confirm={`¿Dar de baja la materia ${subject.code}? Sus grupos se conservan.`}
                        label="Dar de baja"
                        tone="danger"
                        values={{ id: subject.id }}
                      />
                    ) : (
                      <ActionButton
                        action={activateSubjectAction}
                        label="Reactivar"
                        values={{ id: subject.id }}
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
