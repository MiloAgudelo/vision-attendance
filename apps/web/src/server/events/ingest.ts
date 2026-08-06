/**
 * Ingesta de eventos RFID — implementación de `docs/device-contract.md` v1.
 *
 * Es el corazón de la lane W2 y el único camino por el que un lector escribe en el sistema. El
 * orden del pipeline está fijado por `docs/architecture.md` §5 y no es negociable:
 *
 * 1. Credencial `Authorization: Bearer` → 401 `invalid_credentials` si falta, está mal formada o no
 *    corresponde a ningún dispositivo. La búsqueda es **por SHA-256**, nunca por la key en claro.
 * 2. Dispositivo revocado → 403 `device_revoked`. `deviceId` distinto del de la credencial → 403
 *    `device_mismatch`.
 * 3. Versión de contrato incompatible → 400 `unsupported_contract`; solo entonces se valida el
 *    cuerpo completo → 400 `invalid_payload`.
 * 4. Idempotencia (RN7): si ya existe `(device_id, event_id)` se devuelve la respuesta almacenada,
 *    tal cual, con 200 y sin reprocesar nada.
 * 5. Se resuelve el carnet por UID normalizado activo.
 * 6. **Se inserta siempre la fila en `rfid_events` (RN1)**: todo evento válido de un dispositivo
 *    autorizado queda registrado con su hora, pase lo que pase después.
 * 7. Se guarda en `rfid_events.response` el JSON exacto que se devuelve.
 *
 * Los resultados de negocio —incluidos los negativos— responden **200**: el firmware decide
 * LED/buzzer por `result`, no por el código HTTP. Los códigos de error son solo de transporte,
 * credenciales y validación.
 */

import { randomUUID } from 'node:crypto';

import { cards, getDatabase, rfidEvents, students, type Database } from '@va/db';
import {
  contractVersionProbeSchema,
  deviceEventRequestSchema,
  isSupportedContractVersion,
  type DeviceEventStudent,
} from '@va/shared';
import { and, eq } from 'drizzle-orm';

import {
  findDeviceByApiKey,
  recordDeviceContact,
  type AuthenticatedDevice,
} from '../devices/devices';
import { extractBearerApiKey } from '../devices/credentials';
import { noSessionAttendanceEngine, type AttendanceEngine } from './attendance-engine';
import {
  buildSuccessResponse,
  deviceErrorResult,
  replayStoredResponse,
  type DeviceEventHttpResult,
} from './responses';
import type { Database as Queryable, EventResult } from './types';

export interface IngestDeviceEventOptions {
  /** Contenido crudo de la cabecera `Authorization`. */
  authorization: string | null | undefined;
  /**
   * Cuerpo ya parseado como JSON. Si el cuerpo no era JSON válido se pasa `undefined`: la
   * credencial se comprueba igualmente antes de responder `invalid_payload`.
   */
  body: unknown;
  database?: Database;
  /** Motor de asistencia (lane W4). Por defecto, el provisional que devuelve `no_session`. */
  attendanceEngine?: AttendanceEngine;
  /** Reloj del servidor. Inyectable para poder fijar `received_at` en las pruebas. */
  now?: () => Date;
}

/** Procesa un evento del lector y devuelve el par (código HTTP, cuerpo) exacto del contrato. */
export async function ingestDeviceEvent(
  options: IngestDeviceEventOptions,
): Promise<DeviceEventHttpResult> {
  const database = options.database ?? getDatabase();
  const attendanceEngine = options.attendanceEngine ?? noSessionAttendanceEngine;
  const now = options.now ?? (() => new Date());

  /* 1. Credencial. */
  const apiKey = extractBearerApiKey(options.authorization);
  if (!apiKey) return deviceErrorResult('invalid_credentials');

  const device = await findDeviceByApiKey(apiKey, { database });
  if (!device) return deviceErrorResult('invalid_credentials');

  /* 2. Estado del dispositivo y coincidencia del `deviceId`. */
  if (device.status === 'revoked') return deviceErrorResult('device_revoked');

  // El contrato pone `device_mismatch` antes de la validación del cuerpo, así que el `deviceId` se
  // lee de forma laxa: si viene y no coincide, es 403 aunque el resto del cuerpo esté mal.
  const claimedDeviceId = readClaimedDeviceId(options.body);
  if (claimedDeviceId !== null && claimedDeviceId !== device.name) {
    return deviceErrorResult('device_mismatch');
  }

  /* 3. Versión de contrato y luego cuerpo completo. */
  const probe = contractVersionProbeSchema.safeParse(options.body);
  if (probe.success && !isSupportedContractVersion(probe.data.contractVersion)) {
    return deviceErrorResult('unsupported_contract');
  }

  const parsed = deviceEventRequestSchema.safeParse(options.body);
  if (!parsed.success) return deviceErrorResult('invalid_payload');
  const event = parsed.data;

  // El cuerpo validado tiene que seguir apuntando a este dispositivo (`deviceId` es obligatorio,
  // así que aquí solo puede fallar si la lectura laxa de arriba no lo encontró).
  if (event.deviceId !== device.name) return deviceErrorResult('device_mismatch');

  const receivedAt = now();
  await recordDeviceContact(
    device.id,
    { seenAt: receivedAt, firmwareVersion: event.firmwareVersion },
    { database },
  );

  /* 4. Idempotencia (RN7) antes de tocar nada más. */
  const alreadyProcessed = await findStoredResponse(database, device.id, event.eventId);
  if (alreadyProcessed !== null) return replayStoredResponse(alreadyProcessed);

  /* 5–7. Resolución, registro incondicional y respuesta. */
  return database.transaction(async (tx) => {
    const resolution = await resolveCard(tx, event.cardUid);
    const outcome = await decideOutcome({
      tx,
      device,
      cardUid: event.cardUid,
      resolution,
      receivedAt,
      attendanceEngine,
      eventRowId: randomUUID(),
    });

    const response = buildSuccessResponse({
      eventId: event.eventId,
      result: outcome.result,
      receivedAt,
      student: outcome.student,
      session: outcome.session,
    });

    // RN1: la fila se inserta siempre. `ON CONFLICT DO NOTHING` sobre UNIQUE(device_id, event_id)
    // hace que dos peticiones concurrentes con el mismo `eventId` no creen dos filas; el perdedor
    // de la carrera relee y devuelve la respuesta del ganador, sin error.
    const inserted = await tx
      .insert(rfidEvents)
      .values({
        id: outcome.eventRowId,
        deviceId: device.id,
        eventId: event.eventId,
        cardUid: event.cardUid,
        cardId: outcome.cardId,
        // Reloj del dispositivo: informativo (RN8). Trae offset obligatorio por contrato.
        scannedAt: event.scannedAt ? new Date(event.scannedAt) : null,
        receivedAt,
        result: outcome.result,
        response,
      })
      .onConflictDoNothing({ target: [rfidEvents.deviceId, rfidEvents.eventId] })
      .returning({ id: rfidEvents.id });

    if (inserted.length === 0) {
      const winner = await findStoredResponse(tx, device.id, event.eventId);
      return winner !== null ? replayStoredResponse(winner) : { status: 200, body: response };
    }

    // Escrituras del motor que necesitaban la fila del evento ya insertada (W4).
    await outcome.persist?.();

    return { status: 200, body: response };
  });
}

/* -------------------------------------------------------------------------- */
/* Pasos del pipeline                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Lee `deviceId` del cuerpo sin validarlo del todo.
 *
 * Devuelve `null` cuando el campo no está o no es texto: en ese caso la petición sigue hasta la
 * validación completa y acaba en `invalid_payload`, que es lo correcto.
 */
function readClaimedDeviceId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)['deviceId'];
  return typeof value === 'string' ? value.trim() : null;
}

/** Respuesta almacenada de un `(device_id, event_id)` ya procesado, o `null` si es la primera vez. */
async function findStoredResponse(
  database: Queryable,
  deviceRowId: string,
  eventId: string,
): Promise<unknown> {
  const [row] = await database
    .select({ response: rfidEvents.response })
    .from(rfidEvents)
    .where(and(eq(rfidEvents.deviceId, deviceRowId), eq(rfidEvents.eventId, eventId)))
    .limit(1);

  return row ? row.response : null;
}

/** Carnet activo que resuelve un UID, con su estudiante si lo tiene. */
interface CardResolution {
  cardId: string;
  cardUid: string;
  student: { id: string; studentCode: string; fullName: string } | null;
}

/** Resuelve el UID normalizado contra el carnet **activo** que lo lleva (índice parcial). */
async function resolveCard(database: Queryable, cardUid: string): Promise<CardResolution | null> {
  const [row] = await database
    .select({
      cardId: cards.id,
      cardUid: cards.uid,
      studentId: students.id,
      studentCode: students.studentCode,
      studentName: students.fullName,
    })
    .from(cards)
    .leftJoin(students, eq(students.id, cards.studentId))
    .where(and(eq(cards.uid, cardUid), eq(cards.status, 'active')))
    .limit(1);

  if (!row) return null;

  return {
    cardId: row.cardId,
    cardUid: row.cardUid,
    student:
      row.studentId && row.studentCode && row.studentName
        ? { id: row.studentId, studentCode: row.studentCode, fullName: row.studentName }
        : null,
  };
}

interface DecideOutcomeInput {
  tx: Queryable;
  device: AuthenticatedDevice;
  /** UID normalizado que llegó en el evento. */
  cardUid: string;
  resolution: CardResolution | null;
  receivedAt: Date;
  attendanceEngine: AttendanceEngine;
  eventRowId: string;
}

interface EventOutcome {
  eventRowId: string;
  result: EventResult;
  cardId: string | null;
  student: DeviceEventStudent | null;
  session: { id: string; scheduledStart: string } | null;
  persist?: (() => Promise<void>) | undefined;
}

/**
 * Decide el `result` del evento.
 *
 * Un carnet cuenta como **conocido** cuando existe activo Y tiene estudiante: el contrato define
 * `unknown_card` como «carnet no asociado» y la respuesta de `no_session` lleva obligatoriamente el
 * bloque `student`, así que un UID capturado y todavía sin asignar no puede producir `no_session`.
 *
 * - Modo `enrollment` y carnet sin estudiante → se captura el UID (idempotente) y
 *   `enrollment_captured`.
 * - Modo `normal` y carnet sin estudiante → `unknown_card`.
 * - Carnet con estudiante (en cualquier modo) → decide el motor de asistencia (W4).
 *
 * Si el motor falla, el evento **se registra igualmente** con `result = 'error'` (RN1 y catálogo
 * del contrato: «error interno ya persistido»), no con un 500 que perdería la hora de entrada.
 */
async function decideOutcome(input: DecideOutcomeInput): Promise<EventOutcome> {
  const { tx, device, resolution, receivedAt, attendanceEngine, eventRowId } = input;

  try {
    if (resolution?.student) {
      const decision = await attendanceEngine({
        tx,
        eventRowId,
        receivedAt,
        device: { id: device.id, name: device.name, mode: device.mode, room: device.room },
        card: { id: resolution.cardId, uid: resolution.cardUid },
        student: resolution.student,
      });

      return {
        eventRowId,
        result: decision.result,
        cardId: resolution.cardId,
        student: {
          code: resolution.student.studentCode,
          name: resolution.student.fullName,
        },
        session: decision.session,
        persist: decision.persist,
      };
    }

    if (device.mode === 'enrollment') {
      const capturedCardId = await captureCardForEnrollment(tx, input.cardUid);
      return {
        eventRowId,
        result: 'enrollment_captured',
        cardId: capturedCardId,
        student: null,
        session: null,
      };
    }

    return {
      eventRowId,
      result: 'unknown_card',
      cardId: resolution?.cardId ?? null,
      student: null,
      session: null,
    };
  } catch (error) {
    console.error('[events] fallo al resolver el evento; se registra como `error`:', error);
    return {
      eventRowId,
      result: 'error',
      cardId: resolution?.cardId ?? null,
      student: null,
      session: null,
    };
  }
}

/**
 * Captura un UID en modo enrolamiento: crea el carnet con `student_id = NULL` si no existía.
 *
 * Idempotente: `ON CONFLICT DO NOTHING` contra el índice parcial `UNIQUE(uid) WHERE
 * status = 'active'`, así que repetir la lectura no duplica el carnet ni bajo concurrencia.
 */
async function captureCardForEnrollment(tx: Queryable, cardUid: string): Promise<string | null> {
  const [created] = await tx
    .insert(cards)
    .values({ uid: cardUid, studentId: null, status: 'active' })
    .onConflictDoNothing()
    .returning({ id: cards.id });

  if (created) return created.id;

  // Perdimos la carrera contra otra captura simultánea del mismo UID: releemos la suya.
  const existing = await resolveCard(tx, cardUid);
  return existing?.cardId ?? null;
}
