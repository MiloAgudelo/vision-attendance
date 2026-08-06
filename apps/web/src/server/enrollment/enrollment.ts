/**
 * Enrolamiento de carnets: qué UIDs capturó el lector y cómo se asocian a un estudiante.
 *
 * Un lector en modo `enrollment` crea filas en `cards` con `student_id = NULL` (ver
 * `src/server/events/ingest.ts`). Estas funciones son el otro extremo del flujo: listarlas en la
 * web y asignarlas. Solo lectura sobre `students`; la gestión de estudiantes es de la lane W1.
 */

import { cards, devices, getDatabase, rfidEvents, students, type Database } from '@va/db';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import { BusinessRuleError, isUniqueViolation } from '../devices/errors';
import { assignCardInputSchema } from './schemas';

/** Índice parcial `UNIQUE (uid) WHERE status = 'active'` de `cards` (`docs/data-model.md`). */
const ACTIVE_UID_UNIQUE_INDEX = 'cards_uid_active_unique';

export interface EnrollmentServiceOptions {
  database?: Database;
}

function resolveDatabase(options: EnrollmentServiceOptions = {}): Database {
  return options.database ?? getDatabase();
}

/* -------------------------------------------------------------------------- */
/* Consultas                                                                   */
/* -------------------------------------------------------------------------- */

/** Carnet capturado por el lector y todavía sin estudiante. */
export interface PendingCard {
  id: string;
  uid: string;
  createdAt: Date;
}

/** Carnets activos con `student_id IS NULL`: lo que queda por asociar. */
export async function listPendingCards(
  options: EnrollmentServiceOptions = {},
): Promise<PendingCard[]> {
  return resolveDatabase(options)
    .select({ id: cards.id, uid: cards.uid, createdAt: cards.createdAt })
    .from(cards)
    .where(and(isNull(cards.studentId), eq(cards.status, 'active')))
    .orderBy(desc(cards.createdAt));
}

/** Estudiante al que se puede asociar un carnet. */
export interface AssignableStudent {
  id: string;
  studentCode: string;
  fullName: string;
}

/** Estudiantes activos, para el selector de asociación. Solo lectura (la lane W1 los gestiona). */
export async function listAssignableStudents(
  options: EnrollmentServiceOptions = {},
): Promise<AssignableStudent[]> {
  return resolveDatabase(options)
    .select({ id: students.id, studentCode: students.studentCode, fullName: students.fullName })
    .from(students)
    .where(eq(students.status, 'active'))
    .orderBy(students.fullName);
}

/** Lectura de enrolamiento tal como se muestra en la bitácora de la pantalla. */
export interface EnrollmentCapture {
  eventId: string;
  cardUid: string;
  receivedAt: Date;
  deviceName: string;
}

/** Últimos eventos `enrollment_captured`, para ver qué se acaba de escanear. */
export async function listRecentCaptures(
  limit = 20,
  options: EnrollmentServiceOptions = {},
): Promise<EnrollmentCapture[]> {
  return resolveDatabase(options)
    .select({
      eventId: rfidEvents.eventId,
      cardUid: rfidEvents.cardUid,
      receivedAt: rfidEvents.receivedAt,
      deviceName: devices.name,
    })
    .from(rfidEvents)
    .innerJoin(devices, eq(devices.id, rfidEvents.deviceId))
    .where(eq(rfidEvents.result, 'enrollment_captured'))
    .orderBy(desc(rfidEvents.receivedAt))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Asociación                                                                  */
/* -------------------------------------------------------------------------- */

export interface AssignedCard {
  id: string;
  uid: string;
  studentId: string;
  studentCode: string;
  studentName: string;
}

/**
 * Asocia un carnet capturado a un estudiante existente.
 *
 * Reglas de negocio (todas devuelven {@link BusinessRuleError} con mensaje en español, nunca 500):
 * - el carnet tiene que existir y seguir sin asignar;
 * - el estudiante tiene que existir y estar activo;
 * - el UID no puede estar ya activo en **otro** carnet — es el índice parcial
 *   `UNIQUE (uid) WHERE status = 'active'`, que se comprueba antes y además se atrapa después por
 *   si dos administradores asocian a la vez.
 *
 * La asociación deja el carnet activo: un UID capturado y luego desactivado se puede reactivar
 * asignándolo, y ahí es donde el índice parcial puede chocar de verdad.
 */
export async function assignCardToStudent(
  input: { cardId: string; studentId: string },
  options: EnrollmentServiceOptions = {},
): Promise<AssignedCard> {
  const parsed = assignCardInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BusinessRuleError(
      parsed.error.issues[0]?.message ?? 'Los datos de la asociación no son válidos.',
    );
  }

  const { cardId, studentId } = parsed.data;
  const database = resolveDatabase(options);

  return database.transaction(async (tx) => {
    const [card] = await tx.select().from(cards).where(eq(cards.id, cardId)).limit(1);
    if (!card) throw new BusinessRuleError('El carnet indicado ya no existe.');
    if (card.studentId !== null) {
      throw new BusinessRuleError(`El carnet ${card.uid} ya está asignado a un estudiante.`);
    }

    const [student] = await tx
      .select({ id: students.id, studentCode: students.studentCode, fullName: students.fullName })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.status, 'active')))
      .limit(1);
    if (!student) throw new BusinessRuleError('El estudiante indicado no existe o está inactivo.');

    const [conflict] = await tx
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.uid, card.uid), eq(cards.status, 'active'), ne(cards.id, card.id)))
      .limit(1);
    if (conflict) throw new BusinessRuleError(uidInUseMessage(card.uid));

    try {
      const [updated] = await tx
        .update(cards)
        .set({ studentId: student.id, status: 'active', assignedAt: new Date() })
        .where(and(eq(cards.id, card.id), isNull(cards.studentId)))
        .returning({ id: cards.id, uid: cards.uid });

      if (!updated) {
        throw new BusinessRuleError('El carnet acaba de ser asignado por otra persona.');
      }

      return {
        id: updated.id,
        uid: updated.uid,
        studentId: student.id,
        studentCode: student.studentCode,
        studentName: student.fullName,
      };
    } catch (error) {
      if (isUniqueViolation(error, ACTIVE_UID_UNIQUE_INDEX)) {
        throw new BusinessRuleError(uidInUseMessage(card.uid));
      }
      throw error;
    }
  });
}

function uidInUseMessage(uid: string): string {
  return (
    `El UID ${uid} ya está activo en otro carnet. Desactiva ese carnet antes de reasignar el UID ` +
    'a este estudiante.'
  );
}
