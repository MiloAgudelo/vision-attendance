/**
 * Edición de un estudiante.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { isDomainError } from '@/server/academic/errors';
import { getStudent } from '@/server/academic/students';

import { ActionButton } from '../../_components/action-button';
import { EntityForm } from '../../_components/entity-form';
import { PageHeader, Panel, StatusBadge } from '../../_components/ui';

import { activateStudentAction, deactivateStudentAction, updateStudentAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const student = await getStudent(id).catch((error: unknown) => {
    if (isDomainError(error) && error.code === 'not_found') notFound();
    throw error;
  });

  return (
    <>
      <PageHeader
        actions={
          <Link
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            href="/students"
          >
            Volver al listado
          </Link>
        }
        description={`Código ${student.studentCode}`}
        title={student.fullName}
      />

      <Panel title="Datos del estudiante">
        <EntityForm
          action={updateStudentAction}
          columns={2}
          fields={[
            { kind: 'hidden', name: 'id', value: student.id },
            {
              kind: 'text',
              name: 'studentCode',
              label: 'Código estudiantil',
              defaultValue: student.studentCode,
              required: true,
            },
            {
              kind: 'text',
              name: 'fullName',
              label: 'Nombre completo',
              defaultValue: student.fullName,
              required: true,
            },
          ]}
          submitLabel="Guardar cambios"
        />
      </Panel>

      <Panel
        description="Dar de baja no borra la ficha ni su historial de asistencia: solo la retira de los listados."
        title="Estado"
      >
        <div className="flex flex-wrap items-center gap-4">
          <StatusBadge status={student.status} />

          {student.status === 'active' ? (
            <ActionButton
              action={deactivateStudentAction}
              confirm={`¿Dar de baja a ${student.fullName}?`}
              label="Dar de baja"
              tone="danger"
              values={{ id: student.id }}
            />
          ) : (
            <ActionButton
              action={activateStudentAction}
              label="Reactivar"
              values={{ id: student.id }}
            />
          )}
        </div>
      </Panel>

      <Panel
        description="El carnet se asocia desde el enrolamiento por escaneo, que administra otra sección del sistema."
        title="Carnet"
      >
        <p className="font-mono text-sm">{student.cardUid ?? 'Sin carnet asociado'}</p>
      </Panel>
    </>
  );
}
