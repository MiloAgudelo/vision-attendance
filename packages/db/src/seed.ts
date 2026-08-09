/**
 * `pnpm db:seed` — datos mínimos para desarrollar sin hardware.
 *
 * Idempotente: se puede ejecutar tantas veces como se quiera. Cada fila se inserta con
 * `ON CONFLICT DO NOTHING` sobre su clave natural y después se relee, así que dos ejecuciones
 * seguidas dejan exactamente el mismo estado.
 *
 * Siembra: 1 administrador, 1 profesor, 1 materia, 1 grupo (ventana de 60 minutos), su horario
 * semanal, 8 estudiantes con carnet e inscripción, y 1 dispositivo de desarrollo. De la API key
 * del dispositivo solo se guarda el hash SHA-256; la key en claro se imprime una única vez.
 */

import { createHash, randomBytes } from 'node:crypto';
import process from 'node:process';

import { formatDeviceApiKey, parseCardUid } from '@va/shared';
import { and, eq } from 'drizzle-orm';

import { closeDatabase, createDatabase, type Database } from './client.js';
import { getDatabaseUrl } from './env.js';
import {
  cards,
  devices,
  enrollments,
  groups,
  schedules,
  students,
  subjects,
  users,
} from './schema.js';

/* -------------------------------------------------------------------------- */
/* Datos de desarrollo                                                         */
/* -------------------------------------------------------------------------- */

const ADMIN = {
  email: 'admin@vision.local',
  fullName: 'Administradora del Piloto',
  role: 'admin',
} as const;

const TEACHER = {
  email: 'profesor@vision.local',
  fullName: 'Profesor de Laboratorio de Desarrollo',
  role: 'teacher',
} as const;

const SUBJECT = { code: 'LAB-DES', name: 'Laboratorio de Desarrollo' } as const;

const GROUP = { name: 'G1', term: '2026-2', sessionWindowMinutes: 60 } as const;

/** Horario semanal en hora local `America/Bogota` (RN10). 2 = martes, 4 = jueves (ISO). */
const SCHEDULE_SLOTS = [
  { weekday: 2, startTime: '18:00:00', endTime: '20:00:00', room: 'Bloque A - 301' },
  { weekday: 4, startTime: '18:00:00', endTime: '20:00:00', room: 'Bloque A - 301' },
] as const;

/** UIDs de 4 bytes (8 caracteres hex), la longitud típica de un carnet MIFARE Classic. */
const STUDENTS = [
  { studentCode: '202410001', fullName: 'Ana María Restrepo', cardUid: 'A1B2C3D4' },
  { studentCode: '202410002', fullName: 'Bruno Cárdenas Ríos', cardUid: 'B2C3D4E5' },
  { studentCode: '202410003', fullName: 'Carolina Ospina Vélez', cardUid: 'C3D4E5F6' },
  { studentCode: '202410004', fullName: 'Daniel Zapata Muñoz', cardUid: 'D4E5F607' },
  { studentCode: '202410005', fullName: 'Elena Quintero Sáenz', cardUid: 'E5F60718' },
  { studentCode: '202410006', fullName: 'Felipe Agudelo Ríos', cardUid: 'F6071829' },
  { studentCode: '202410007', fullName: 'Gabriela Ochoa Peña', cardUid: '0718293A' },
  { studentCode: '202410008', fullName: 'Héctor Villa Betancur', cardUid: '18293A4B' },
] as const;

const DEVICE = { name: 'LAB-DESARROLLO-01', room: 'Bloque A - 301' } as const;

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/** Hash con el que se almacena la credencial del dispositivo (`docs/data-model.md`). */
export function hashDeviceApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

/** Genera el secreto de una credencial nueva: 32 bytes en base64url. */
function generateDeviceSecret(): string {
  return randomBytes(32).toString('base64url');
}

/* -------------------------------------------------------------------------- */
/* Siembra                                                                     */
/* -------------------------------------------------------------------------- */

async function seedUsers(database: Database) {
  await database
    .insert(users)
    .values([
      { email: ADMIN.email, fullName: ADMIN.fullName, role: ADMIN.role },
      { email: TEACHER.email, fullName: TEACHER.fullName, role: TEACHER.role },
    ])
    .onConflictDoNothing({ target: users.email });

  const [admin] = await database.select().from(users).where(eq(users.email, ADMIN.email));
  const [teacher] = await database.select().from(users).where(eq(users.email, TEACHER.email));

  if (!admin || !teacher) throw new Error('No se pudieron sembrar las cuentas web.');
  console.log(`  · usuarios: ${ADMIN.email} (admin), ${TEACHER.email} (profesor)`);
  return { admin, teacher };
}

async function seedSubjectAndGroup(database: Database, teacherId: string) {
  await database
    .insert(subjects)
    .values({ code: SUBJECT.code, name: SUBJECT.name })
    .onConflictDoNothing({ target: subjects.code });

  const [subject] = await database.select().from(subjects).where(eq(subjects.code, SUBJECT.code));
  if (!subject) throw new Error('No se pudo sembrar la materia.');

  await database
    .insert(groups)
    .values({
      subjectId: subject.id,
      name: GROUP.name,
      term: GROUP.term,
      teacherId,
      sessionWindowMinutes: GROUP.sessionWindowMinutes,
    })
    .onConflictDoNothing({ target: [groups.subjectId, groups.name, groups.term] });

  const [group] = await database
    .select()
    .from(groups)
    .where(
      and(
        eq(groups.subjectId, subject.id),
        eq(groups.name, GROUP.name),
        eq(groups.term, GROUP.term),
      ),
    );
  if (!group) throw new Error('No se pudo sembrar el grupo.');

  console.log(
    `  · materia ${SUBJECT.code} y grupo ${GROUP.name} (${GROUP.term}), ` +
      `ventana de ${GROUP.sessionWindowMinutes} minutos`,
  );
  return { subject, group };
}

async function seedSchedules(database: Database, groupId: string) {
  const existing = await database
    .select({ weekday: schedules.weekday, startTime: schedules.startTime })
    .from(schedules)
    .where(eq(schedules.groupId, groupId));

  const alreadyThere = new Set(existing.map((row) => `${row.weekday}@${row.startTime}`));
  const pending = SCHEDULE_SLOTS.filter(
    (slot) => !alreadyThere.has(`${slot.weekday}@${slot.startTime}`),
  );

  if (pending.length > 0) {
    await database.insert(schedules).values(pending.map((slot) => ({ groupId, ...slot })));
  }

  console.log(
    `  · horario semanal: ${SCHEDULE_SLOTS.map(
      (slot) => `día ISO ${slot.weekday} ${slot.startTime}–${slot.endTime}`,
    ).join(', ')} (hora local de Bogotá)`,
  );
}

async function seedStudents(database: Database, groupId: string) {
  await database
    .insert(students)
    .values(STUDENTS.map(({ studentCode, fullName }) => ({ studentCode, fullName })))
    .onConflictDoNothing({ target: students.studentCode });

  const rows = await database.select().from(students);
  const byCode = new Map(rows.map((row) => [row.studentCode, row]));

  for (const seedStudent of STUDENTS) {
    const student = byCode.get(seedStudent.studentCode);
    if (!student) throw new Error(`No se pudo sembrar el estudiante ${seedStudent.studentCode}.`);

    await database
      .insert(cards)
      .values({
        uid: parseCardUid(seedStudent.cardUid),
        studentId: student.id,
        assignedAt: new Date(),
      })
      .onConflictDoNothing();

    await database
      .insert(enrollments)
      .values({ groupId, studentId: student.id })
      .onConflictDoNothing({ target: [enrollments.groupId, enrollments.studentId] });
  }

  console.log(`  · ${STUDENTS.length} estudiantes con carnet activo e inscripción en el grupo`);
}

async function seedDevice(database: Database) {
  const [existing] = await database.select().from(devices).where(eq(devices.name, DEVICE.name));

  if (existing) {
    console.log(
      `  · dispositivo ${DEVICE.name} ya registrado; su API key no se puede volver a mostrar ` +
        '(solo se guarda el hash). Para obtener una nueva, ejecuta `pnpm db:reset`.',
    );
    return;
  }

  const apiKey = formatDeviceApiKey(DEVICE.name, generateDeviceSecret());

  await database.insert(devices).values({
    name: DEVICE.name,
    apiKeyHash: hashDeviceApiKey(apiKey),
    room: DEVICE.room,
    mode: 'normal',
    status: 'active',
  });

  console.log(`  · dispositivo ${DEVICE.name} registrado (modo normal)`);
  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log('  API key del dispositivo de desarrollo — se muestra UNA SOLA VEZ:');
  console.log(`\n    ${apiKey}\n`);
  console.log('  Úsala como  Authorization: Bearer <api key>  al llamar a POST /api/v1/events.');
  console.log('  En la base solo queda su hash SHA-256.');
  console.log('──────────────────────────────────────────────────────────────────────');
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const database = createDatabase({ url: getDatabaseUrl(), max: 1 });

  try {
    console.log('→ Sembrando datos de desarrollo');
    const { teacher } = await seedUsers(database);
    const { group } = await seedSubjectAndGroup(database, teacher.id);
    await seedSchedules(database, group.id);
    await seedStudents(database, group.id);
    await seedDevice(database);
    console.log('\n✔ Datos de desarrollo listos.');
  } finally {
    await closeDatabase(database);
  }
}

main().catch((error: unknown) => {
  console.error('\n✖ Falló la siembra de datos:');
  console.error(error);
  process.exitCode = 1;
});
