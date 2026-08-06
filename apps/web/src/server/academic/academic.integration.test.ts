/**
 * Pruebas de integración del dominio académico contra PostgreSQL real.
 *
 * Comprueban lo que ninguna prueba unitaria puede comprobar: que las restricciones del esquema
 * existen de verdad y que sus violaciones llegan a la interfaz como mensajes de negocio en español
 * y no como excepciones crudas.
 *
 * Usan `DATABASE_URL` (la base de la lane en local, el PostgreSQL del job en CI) y borran al
 * terminar únicamente las filas que ellas mismas crearon.
 */

import { randomUUID } from 'node:crypto';

import {
  closeDatabase,
  createDatabase,
  enrollments as enrollmentsTable,
  getDatabaseUrl,
  groups as groupsTable,
  schedules as schedulesTable,
  students as studentsTable,
  subjects as subjectsTable,
  type Database,
} from '@va/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  enrollStudent,
  listEnrollableStudents,
  listEnrollments,
  withdrawStudent,
} from './enrollments.js';
import { DomainError, translateDatabaseError } from './errors.js';
import { createGroup, deactivateGroup, getGroup, listGroups, updateGroup } from './groups.js';
import { addSchedule, listSchedulesByGroup, removeSchedule } from './schedules.js';
import { createStudent, deactivateStudent, listStudents } from './students.js';
import { createSubject, deactivateSubject, listSubjects } from './subjects.js';

let db: Database;

/** Filas creadas por estas pruebas, para poder limpiarlas sin tocar nada más. */
const created = { subjects: [] as string[], groups: [] as string[], students: [] as string[] };

/** Sufijo irrepetible: dos ejecuciones seguidas no chocan entre sí por unicidad. */
const suffix = randomUUID().slice(0, 8).toUpperCase();

async function newSubject(name = 'Materia de prueba') {
  const subject = await createSubject({ code: `T-${suffix}-${created.subjects.length}`, name }, db);
  created.subjects.push(subject.id);
  return subject;
}

async function newStudent(fullName = 'Estudiante de Prueba') {
  const student = await createStudent(
    { studentCode: `T-${suffix}-${created.students.length}`, fullName },
    db,
  );
  created.students.push(student.id);
  return student;
}

async function newGroup(subjectId: string, name = 'G1', term = `T${suffix}`) {
  const group = await createGroup({ subjectId, name, term }, db);
  created.groups.push(group.id);
  return group;
}

beforeAll(() => {
  db = createDatabase({ url: getDatabaseUrl(), max: 1 });
});

afterAll(async () => {
  if (created.groups.length > 0) {
    await db.delete(schedulesTable).where(inArray(schedulesTable.groupId, created.groups));
    await db.delete(enrollmentsTable).where(inArray(enrollmentsTable.groupId, created.groups));
    await db.delete(groupsTable).where(inArray(groupsTable.id, created.groups));
  }
  if (created.subjects.length > 0) {
    await db.delete(subjectsTable).where(inArray(subjectsTable.id, created.subjects));
  }
  if (created.students.length > 0) {
    await db.delete(studentsTable).where(inArray(studentsTable.id, created.students));
  }

  await closeDatabase(db);
});

/* -------------------------------------------------------------------------- */

describe('unicidad de estudiantes y materias', () => {
  it('el segundo estudiante con el mismo código falla con mensaje de negocio', async () => {
    const first = await newStudent();

    const repeated = createStudent({ studentCode: first.studentCode, fullName: 'Otro Nombre' }, db);

    await expect(repeated).rejects.toBeInstanceOf(DomainError);
    await expect(repeated).rejects.toMatchObject({
      code: 'conflict',
      message: 'Ya existe un estudiante con ese código estudiantil.',
    });
  });

  it('la segunda materia con el mismo código falla con mensaje de negocio', async () => {
    const first = await newSubject();

    const repeated = createSubject({ code: first.code, name: 'Otro nombre' }, db);

    await expect(repeated).rejects.toBeInstanceOf(DomainError);
    await expect(repeated).rejects.toMatchObject({
      code: 'conflict',
      message: 'Ya existe una materia con ese código.',
    });
  });
});

describe('unicidad de grupos: UNIQUE(subject_id, name, term)', () => {
  it('el segundo grupo con la misma materia, nombre y periodo falla con mensaje de negocio', async () => {
    const subject = await newSubject();
    await newGroup(subject.id, 'G1', `2026-2-${suffix}`);

    const repeated = createGroup(
      { subjectId: subject.id, name: 'G1', term: `2026-2-${suffix}` },
      db,
    );

    await expect(repeated).rejects.toBeInstanceOf(DomainError);
    await expect(repeated).rejects.toMatchObject({
      code: 'conflict',
      message: 'Ya existe un grupo con ese nombre para la misma materia y el mismo periodo.',
    });
  });

  it('el mismo nombre en otro periodo sí se admite', async () => {
    const subject = await newSubject();
    await newGroup(subject.id, 'G2', `2026-1-${suffix}`);

    await expect(newGroup(subject.id, 'G2', `2026-2-${suffix}`)).resolves.toMatchObject({
      name: 'G2',
    });
  });
});

describe('unicidad de inscripciones: UNIQUE(group_id, student_id)', () => {
  it('el segundo intento de inscribir al mismo estudiante falla con mensaje de negocio', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-INS', `2026-2-${suffix}`);
    const student = await newStudent();

    await enrollStudent({ groupId: group.id, studentId: student.id }, db);
    const repeated = enrollStudent({ groupId: group.id, studentId: student.id }, db);

    await expect(repeated).rejects.toBeInstanceOf(DomainError);
    await expect(repeated).rejects.toMatchObject({
      code: 'conflict',
      message: 'El estudiante ya está inscrito en este grupo.',
    });
  });

  it('volver a inscribir a quien fue retirado reactiva su misma fila, sin duplicarla', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-REINS', `2026-2-${suffix}`);
    const student = await newStudent();

    const first = await enrollStudent({ groupId: group.id, studentId: student.id }, db);
    await withdrawStudent({ groupId: group.id, studentId: student.id }, db);
    const again = await enrollStudent({ groupId: group.id, studentId: student.id }, db);

    expect(again.id).toBe(first.id);
    expect(again.status).toBe('active');

    const rows = await db
      .select({ id: enrollmentsTable.id })
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.groupId, group.id));
    expect(rows).toHaveLength(1);
  });

  it('no deja inscribir a un estudiante dado de baja', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-BAJA', `2026-2-${suffix}`);
    const student = await newStudent();
    await deactivateStudent(student.id, db);

    await expect(
      enrollStudent({ groupId: group.id, studentId: student.id }, db),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'No se puede inscribir a un estudiante dado de baja.',
    });
  });
});

describe('soft-delete: dar de baja no borra la fila y la saca de los listados', () => {
  it('estudiantes', async () => {
    const student = await newStudent('Estudiante Que Se Da De Baja');

    await deactivateStudent(student.id, db);

    const [row] = await db
      .select({ id: studentsTable.id, status: studentsTable.status })
      .from(studentsTable)
      .where(eq(studentsTable.id, student.id));
    expect(row).toEqual({ id: student.id, status: 'inactive' });

    const activos = await listStudents({}, db);
    expect(activos.map((item) => item.id)).not.toContain(student.id);

    const todos = await listStudents({ includeInactive: true }, db);
    expect(todos.map((item) => item.id)).toContain(student.id);
  });

  it('materias', async () => {
    const subject = await newSubject('Materia que se da de baja');

    await deactivateSubject(subject.id, db);

    const [row] = await db
      .select({ id: subjectsTable.id, status: subjectsTable.status })
      .from(subjectsTable)
      .where(eq(subjectsTable.id, subject.id));
    expect(row).toEqual({ id: subject.id, status: 'inactive' });

    expect((await listSubjects({}, db)).map((item) => item.id)).not.toContain(subject.id);
    expect((await listSubjects({ includeInactive: true }, db)).map((item) => item.id)).toContain(
      subject.id,
    );
  });

  it('grupos', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-OFF', `2026-2-${suffix}`);

    await deactivateGroup(group.id, db);

    const [row] = await db
      .select({ id: groupsTable.id, status: groupsTable.status })
      .from(groupsTable)
      .where(eq(groupsTable.id, group.id));
    expect(row).toEqual({ id: group.id, status: 'inactive' });

    expect((await listGroups({}, db)).map((item) => item.id)).not.toContain(group.id);
    expect((await listGroups({ includeInactive: true }, db)).map((item) => item.id)).toContain(
      group.id,
    );
  });

  it('inscripciones: retirar conserva la fila con status inactive', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-RET', `2026-2-${suffix}`);
    const student = await newStudent();
    await enrollStudent({ groupId: group.id, studentId: student.id }, db);

    await withdrawStudent({ groupId: group.id, studentId: student.id }, db);

    const [row] = await db
      .select({ status: enrollmentsTable.status })
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.groupId, group.id));
    expect(row).toEqual({ status: 'inactive' });

    expect(await listEnrollments(group.id, {}, db)).toHaveLength(0);
    expect(await listEnrollments(group.id, { includeInactive: true }, db)).toHaveLength(1);

    // Al quedar sin inscripción activa, vuelve a estar disponible para inscribirlo.
    const disponibles = await listEnrollableStudents(group.id, db);
    expect(disponibles.map((item) => item.id)).toContain(student.id);
  });
});

describe('RN2: la ventana de sesión es configurable por grupo', () => {
  it('nace en 60 minutos y se puede editar', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-VENTANA', `2026-2-${suffix}`);
    expect(group.sessionWindowMinutes).toBe(60);

    await updateGroup(
      group.id,
      {
        subjectId: subject.id,
        name: 'G-VENTANA',
        term: `2026-2-${suffix}`,
        sessionWindowMinutes: 25,
      },
      db,
    );

    expect((await getGroup(group.id, db)).sessionWindowMinutes).toBe(25);
  });
});

describe('CHECK de schedules', () => {
  it('la base rechaza un día fuera de 1–7 y el error se traduce al español', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-CHK1', `2026-2-${suffix}`);

    // Inserción directa: se salta la validación Zod para comprobar que el CHECK existe de verdad.
    const error = await db
      .insert(schedulesTable)
      .values({ groupId: group.id, weekday: 8, startTime: '18:00:00', endTime: '20:00:00' })
      .then(
        () => undefined,
        (cause: unknown) => translateDatabaseError(cause),
      );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).message).toBe(
      'El día de la semana debe estar entre 1 (lunes) y 7 (domingo).',
    );
  });

  it('la base rechaza una hora de fin que no es posterior a la de inicio', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-CHK2', `2026-2-${suffix}`);

    const error = await db
      .insert(schedulesTable)
      .values({ groupId: group.id, weekday: 2, startTime: '20:00:00', endTime: '20:00:00' })
      .then(
        () => undefined,
        (cause: unknown) => translateDatabaseError(cause),
      );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).message).toBe(
      'La hora de fin debe ser posterior a la hora de inicio.',
    );
  });

  it('el dominio rechaza los mismos casos antes de llegar a la base', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-CHK3', `2026-2-${suffix}`);

    await expect(
      addSchedule({ groupId: group.id, weekday: 8, startTime: '18:00', endTime: '20:00' }, db),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'El día de la semana debe estar entre 1 (lunes) y 7 (domingo).',
    });

    await expect(
      addSchedule({ groupId: group.id, weekday: 2, startTime: '20:00', endTime: '18:00' }, db),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'La hora de fin debe ser posterior a la hora de inicio.',
    });
  });
});

describe('horario semanal del grupo', () => {
  it('se guarda tal cual en hora local de Bogotá (RN10) y se puede retirar', async () => {
    const subject = await newSubject();
    const group = await newGroup(subject.id, 'G-HOR', `2026-2-${suffix}`);

    const slot = await addSchedule(
      { groupId: group.id, weekday: 4, startTime: '18:00', endTime: '20:00', room: 'A-301' },
      db,
    );

    // Sin conversión a UTC: la hora local se almacena literalmente en la columna `time`.
    expect(slot).toMatchObject({
      weekday: 4,
      startTime: '18:00:00',
      endTime: '20:00:00',
      room: 'A-301',
    });
    expect(await listSchedulesByGroup(group.id, db)).toHaveLength(1);

    await removeSchedule(slot.id, db);
    expect(await listSchedulesByGroup(group.id, db)).toHaveLength(0);
  });
});
