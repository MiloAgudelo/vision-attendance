/** Edición de una materia, con los grupos que cuelgan de ella. */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireRole } from '@/app/_lib/auth/guards';
import { isDomainError } from '@/server/academic/errors';
import { listGroups } from '@/server/academic/groups';
import { getSubject } from '@/server/academic/subjects';

import { ActionButton } from '../../_components/action-button';
import { EntityForm } from '../../_components/entity-form';
import { EmptyState, PageHeader, Panel, StatusBadge } from '../../_components/ui';

import { activateSubjectAction, deactivateSubjectAction, updateSubjectAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditSubjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin');

  const { id } = await params;

  const subject = await getSubject(id).catch((error: unknown) => {
    if (isDomainError(error) && ['not_found', 'validation'].includes(error.code)) notFound();
    throw error;
  });

  const groups = await listGroups({ includeInactive: true, subjectId: subject.id });

  return (
    <>
      <PageHeader
        actions={
          <Link
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            href="/subjects"
          >
            Volver al listado
          </Link>
        }
        description={`Código ${subject.code}`}
        title={subject.name}
      />

      <Panel title="Datos de la materia">
        <EntityForm
          action={updateSubjectAction}
          columns={2}
          fields={[
            { kind: 'hidden', name: 'id', value: subject.id },
            {
              kind: 'text',
              name: 'code',
              label: 'Código',
              defaultValue: subject.code,
              required: true,
            },
            {
              kind: 'text',
              name: 'name',
              label: 'Nombre',
              defaultValue: subject.name,
              required: true,
            },
          ]}
          submitLabel="Guardar cambios"
        />
      </Panel>

      <Panel
        description="Dar de baja una materia no borra nada: sus grupos y su historial se conservan."
        title="Estado"
      >
        <div className="flex flex-wrap items-center gap-4">
          <StatusBadge status={subject.status} />

          {subject.status === 'active' ? (
            <ActionButton
              action={deactivateSubjectAction}
              confirm={`¿Dar de baja la materia ${subject.code}?`}
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
      </Panel>

      <Panel title={`Grupos de la materia (${groups.length})`}>
        {groups.length === 0 ? (
          <EmptyState>Esta materia todavía no tiene grupos.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {groups.map((group) => (
              <li className="flex flex-wrap items-center gap-3" key={group.id}>
                <Link
                  className="font-medium underline-offset-4 hover:underline"
                  href={`/groups/${group.id}`}
                >
                  {group.name} · {group.term}
                </Link>
                <StatusBadge status={group.status} />
                <span className="text-slate-500 dark:text-slate-400">
                  {group.enrolledCount} inscritos
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
