/**
 * Estudiantes: listado, alta y baja.
 *
 * Minimización de datos (`docs/alcance-v2.md` §16): nombre, código y estado.
 */

import Link from 'next/link';

import { requireRole } from '@/app/_lib/auth/guards';
import { listStudents } from '@/server/academic/students';

import { ActionButton } from '../_components/action-button';
import { EntityForm } from '../_components/entity-form';
import { EmptyState, PageHeader, Panel, StatusBadge, Table, Td, Th } from '../_components/ui';

import { activateStudentAction, createStudentAction, deactivateStudentAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactivos?: string }>;
}) {
  await requireRole('admin');

  const { q = '', inactivos } = await searchParams;
  const includeInactive = inactivos === '1';

  const students = await listStudents({ includeInactive, search: q });

  return (
    <>
      <PageHeader
        description="De cada estudiante se guardan únicamente su nombre, su código estudiantil y su estado."
        title="Estudiantes"
      />

      <Panel
        description="El código estudiantil no se puede repetir."
        title="Registrar un estudiante"
      >
        <EntityForm
          action={createStudentAction}
          columns={2}
          fields={[
            {
              kind: 'text',
              name: 'studentCode',
              label: 'Código estudiantil',
              placeholder: '202410001',
              required: true,
            },
            {
              kind: 'text',
              name: 'fullName',
              label: 'Nombre completo',
              placeholder: 'Ana María Restrepo',
              required: true,
            },
          ]}
          resetOnSuccess
          submitLabel="Registrar estudiante"
        />
      </Panel>

      <Panel title={`Listado (${students.length})`}>
        <form action="/students" className="mb-4 flex flex-wrap items-end gap-3" method="get">
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="q">
              Buscar por nombre o código
            </label>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              defaultValue={q}
              id="q"
              name="q"
              type="text"
            />
          </div>

          <label className="flex items-center gap-2 pb-2 text-sm">
            <input defaultChecked={includeInactive} name="inactivos" type="checkbox" value="1" />
            Incluir dados de baja
          </label>

          <button
            className="mb-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            type="submit"
          >
            Filtrar
          </button>
        </form>

        {students.length === 0 ? (
          <EmptyState>No hay estudiantes que coincidan con el filtro.</EmptyState>
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
            {students.map((student) => (
              <tr key={student.id}>
                <Td>
                  <span className="font-mono text-xs">{student.studentCode}</span>
                </Td>
                <Td>{student.fullName}</Td>
                <Td>
                  <StatusBadge status={student.status} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    <Link
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      href={`/students/${student.id}`}
                    >
                      Editar
                    </Link>

                    {student.status === 'active' ? (
                      <ActionButton
                        action={deactivateStudentAction}
                        confirm={`¿Dar de baja a ${student.fullName}? La ficha se conserva.`}
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
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
