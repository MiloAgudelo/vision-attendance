/**
 * Pantalla del grupo: sus datos, sus inscripciones y su horario semanal.
 *
 * Inscripciones y horarios se administran aquí y no como secciones propias
 * (`docs/agent-playbook.md` §4, W1).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireRole } from '@/app/_lib/auth/guards';
import { listEnrollableStudents, listEnrollments } from '@/server/academic/enrollments';
import { isDomainError } from '@/server/academic/errors';
import { DEFAULT_SESSION_WINDOW_MINUTES, getGroup, listTeachers } from '@/server/academic/groups';
import { WEEKDAYS, listSchedulesByGroup, weekdayLabel } from '@/server/academic/schedules';
import { listSubjects } from '@/server/academic/subjects';

import { ActionButton } from '../../_components/action-button';
import { EntityForm } from '../../_components/entity-form';
import { EmptyState, PageHeader, Panel, StatusBadge, Table, Td, Th } from '../../_components/ui';

import {
  activateGroupAction,
  addScheduleAction,
  deactivateGroupAction,
  enrollStudentAction,
  removeScheduleAction,
  updateGroupAction,
  withdrawStudentAction,
} from '../actions';

export const dynamic = 'force-dynamic';

/** Muestra `18:00:00` como `18:00`: los segundos nunca son significativos en un horario de clase. */
function shortTime(value: string): string {
  return value.slice(0, 5);
}

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin');

  const { id } = await params;

  const group = await getGroup(id).catch((error: unknown) => {
    if (isDomainError(error) && ['not_found', 'validation'].includes(error.code)) notFound();
    throw error;
  });

  const [subjects, teachers, enrollments, enrollable, schedules] = await Promise.all([
    listSubjects(),
    listTeachers(),
    listEnrollments(group.id, { includeInactive: true }),
    listEnrollableStudents(group.id),
    listSchedulesByGroup(group.id),
  ]);

  const active = enrollments.filter((enrollment) => enrollment.status === 'active');
  const withdrawn = enrollments.filter((enrollment) => enrollment.status === 'inactive');
  const subjectOptions = subjects.map((subject) => ({
    value: subject.id,
    label: `${subject.code} — ${subject.name}`,
  }));
  if (!subjectOptions.some((subject) => subject.value === group.subjectId)) {
    subjectOptions.push({
      value: group.subjectId,
      label: `${group.subjectCode} — ${group.subjectName} (actual, inactiva)`,
    });
  }

  const teacherOptions = teachers.map((teacher) => ({
    value: teacher.id,
    label: teacher.fullName,
  }));
  if (group.teacherId && !teacherOptions.some((teacher) => teacher.value === group.teacherId)) {
    teacherOptions.push({
      value: group.teacherId,
      label: `${group.teacherName ?? 'Profesor asignado'} (actual, no disponible)`,
    });
  }

  return (
    <>
      <PageHeader
        actions={
          <Link
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            href="/groups"
          >
            Volver al listado
          </Link>
        }
        description={`${group.subjectCode} — ${group.subjectName} · Periodo ${group.term}`}
        title={`Grupo ${group.name}`}
      />

      <Panel title="Datos del grupo">
        <EntityForm
          action={updateGroupAction}
          columns={2}
          fields={[
            { kind: 'hidden', name: 'id', value: group.id },
            {
              kind: 'select',
              name: 'subjectId',
              label: 'Materia',
              defaultValue: group.subjectId,
              options: subjectOptions,
              required: true,
            },
            {
              kind: 'text',
              name: 'name',
              label: 'Nombre del grupo',
              defaultValue: group.name,
              required: true,
            },
            {
              kind: 'text',
              name: 'term',
              label: 'Periodo académico',
              defaultValue: group.term,
              required: true,
            },
            {
              kind: 'select',
              name: 'teacherId',
              label: 'Profesor (opcional)',
              defaultValue: group.teacherId ?? '',
              options: teacherOptions,
              placeholder: 'Sin asignar',
            },
            {
              kind: 'number',
              name: 'sessionWindowMinutes',
              label: 'Ventana de sesión (minutos)',
              defaultValue: String(group.sessionWindowMinutes),
              hint: `Minutos antes del inicio en los que un escaneo ya cuenta para la clase (RN2). Por defecto, ${DEFAULT_SESSION_WINDOW_MINUTES}.`,
              min: 0,
              max: 720,
            },
          ]}
          submitLabel="Guardar cambios"
        />
      </Panel>

      <Panel
        description="Dar de baja el grupo conserva sus inscripciones, su horario y su historial."
        title="Estado"
      >
        <div className="flex flex-wrap items-center gap-4">
          <StatusBadge status={group.status} />

          {group.status === 'active' ? (
            <ActionButton
              action={deactivateGroupAction}
              confirm={`¿Dar de baja el grupo ${group.name}?`}
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
      </Panel>

      {/* ---------------------------------------------------------------- */}

      <Panel
        description="Un estudiante no puede estar inscrito dos veces en el mismo grupo."
        title={`Inscripciones (${active.length})`}
      >
        {enrollable.length === 0 ? (
          <EmptyState>No quedan estudiantes activos por inscribir en este grupo.</EmptyState>
        ) : (
          <EntityForm
            action={enrollStudentAction}
            columns={2}
            fields={[
              { kind: 'hidden', name: 'groupId', value: group.id },
              {
                kind: 'select',
                name: 'studentId',
                label: 'Estudiante',
                options: enrollable.map((student) => ({
                  value: student.id,
                  label: `${student.studentCode} — ${student.fullName}`,
                })),
                placeholder: 'Selecciona un estudiante',
                required: true,
              },
            ]}
            resetOnSuccess
            submitLabel="Inscribir"
          />
        )}

        <div className="mt-5">
          {active.length === 0 ? (
            <EmptyState>Este grupo todavía no tiene estudiantes inscritos.</EmptyState>
          ) : (
            <Table
              head={
                <tr>
                  <Th>Código</Th>
                  <Th>Estudiante</Th>
                  <Th>Acciones</Th>
                </tr>
              }
            >
              {active.map((enrollment) => (
                <tr key={enrollment.id}>
                  <Td>
                    <span className="font-mono text-xs">{enrollment.studentCode}</span>
                  </Td>
                  <Td>{enrollment.studentName}</Td>
                  <Td>
                    <ActionButton
                      action={withdrawStudentAction}
                      confirm={`¿Retirar a ${enrollment.studentName} del grupo?`}
                      label="Retirar"
                      tone="danger"
                      values={{ groupId: group.id, studentId: enrollment.studentId }}
                    />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        {withdrawn.length > 0 ? (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Retirados del grupo (la inscripción se conserva):{' '}
            {withdrawn.map((enrollment) => enrollment.studentName).join(', ')}.
          </p>
        ) : null}
      </Panel>

      {/* ---------------------------------------------------------------- */}

      <Panel
        description="Las horas se definen en hora local de Bogotá (RN10). El día usa la numeración ISO: 1 es lunes y 7 es domingo."
        title={`Horario semanal (${schedules.length})`}
      >
        <EntityForm
          action={addScheduleAction}
          columns={2}
          fields={[
            { kind: 'hidden', name: 'groupId', value: group.id },
            {
              kind: 'select',
              name: 'weekday',
              label: 'Día de la semana',
              options: WEEKDAYS.map((day) => ({ value: String(day.iso), label: day.label })),
              placeholder: 'Selecciona un día',
              required: true,
            },
            {
              kind: 'text',
              name: 'room',
              label: 'Salón (opcional)',
              placeholder: 'Bloque A - 301',
            },
            {
              kind: 'time',
              name: 'startTime',
              label: 'Hora de inicio',
              placeholder: '18:00',
              required: true,
            },
            {
              kind: 'time',
              name: 'endTime',
              label: 'Hora de fin',
              placeholder: '20:00',
              required: true,
            },
          ]}
          resetOnSuccess
          submitLabel="Añadir franja"
        />

        <div className="mt-5">
          {schedules.length === 0 ? (
            <EmptyState>Este grupo todavía no tiene horario.</EmptyState>
          ) : (
            <Table
              head={
                <tr>
                  <Th>Día</Th>
                  <Th>Inicio</Th>
                  <Th>Fin</Th>
                  <Th>Salón</Th>
                  <Th>Acciones</Th>
                </tr>
              }
            >
              {schedules.map((slot) => (
                <tr key={slot.id}>
                  <Td>{weekdayLabel(slot.weekday)}</Td>
                  <Td>
                    <span className="tabular-nums">{shortTime(slot.startTime)}</span>
                  </Td>
                  <Td>
                    <span className="tabular-nums">{shortTime(slot.endTime)}</span>
                  </Td>
                  <Td>{slot.room ?? '—'}</Td>
                  <Td>
                    <ActionButton
                      action={removeScheduleAction}
                      confirm="¿Retirar esta franja del horario? Las sesiones ya registradas se conservan."
                      label="Retirar"
                      tone="danger"
                      values={{ id: slot.id, groupId: group.id }}
                    />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Panel>
    </>
  );
}
