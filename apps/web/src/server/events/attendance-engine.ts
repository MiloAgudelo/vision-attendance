/**
 * PUNTO DE CONEXIÓN DEL MOTOR DE ASISTENCIA — lo sustituye la lane W4.
 *
 * La lane W2 (dispositivos e ingesta) resuelve el carnet y garantiza el registro incondicional del
 * evento (RN1). Lo que ocurre **después**, cuando el carnet sí pertenece a un estudiante —buscar o
 * crear perezosamente la sesión (RN2/RN3), comprobar la inscripción y crear la asistencia (RN6)—
 * es territorio de W4 (`docs/agent-playbook.md` §4).
 *
 * Mientras tanto, {@link noSessionAttendanceEngine} devuelve siempre `no_session`, que es el
 * resultado correcto del contrato para «la entrada quedó registrada pero no hay clase activa».
 *
 * ## Qué tiene que hacer W4
 *
 * Reemplazar el cuerpo de {@link noSessionAttendanceEngine} (o exportar otra implementación de
 * {@link AttendanceEngine} desde `src/server/attendance/` y pasarla en
 * {@link import('./ingest.js').ingestDeviceEvent}) respetando tres invariantes del pipeline:
 *
 * 1. Se ejecuta **dentro de un SAVEPOINT** de la transacción del evento: usa `context.tx`, no
 *    `getDatabase()`. Si una sentencia SQL falla, W2 revierte ese SAVEPOINT y todavía puede
 *    registrar el evento con `result = 'error'` (RN1).
 * 2. La fila de `rfid_events` todavía **no existe** cuando corre. Su `id` ya está reservado en
 *    `context.eventRowId`, pero cualquier escritura que la referencie por clave foránea —la
 *    asistencia lleva `attendances.event_id`— debe hacerse en la devolución
 *    {@link AttendanceDecision.persist}, que W2 invoca justo después de insertar el evento, en un
 *    SAVEPOINT propio y solo si esta petición ganó la carrera de idempotencia.
 * 3. `context.receivedAt` es la hora oficial de entrada (RN8). El `scannedAt` del lector es
 *    informativo y por eso no se pasa aquí.
 */

import type { Database, DeviceMode, DeviceEventSession, EventResult } from './types';

/**
 * Resultados posibles cuando el carnet **sí** está asociado a un estudiante.
 *
 * `unknown_card` y `enrollment_captured` quedan fuera a propósito: los decide W2 antes de llamar al
 * motor, porque no hay estudiante al que registrarle asistencia.
 */
export type KnownCardResult = Extract<
  EventResult,
  'registered' | 'already_registered' | 'no_session' | 'not_enrolled'
>;

/** Estudiante dueño del carnet leído. */
export interface AttendanceStudent {
  id: string;
  studentCode: string;
  fullName: string;
}

/** Carnet activo que resolvió el UID. */
export interface AttendanceCard {
  id: string;
  /** UID ya normalizado (mayúsculas, sin separadores). */
  uid: string;
}

/** Lector que originó la lectura. */
export interface AttendanceDevice {
  id: string;
  name: string;
  mode: DeviceMode;
  room: string | null;
}

/** Todo lo que el motor necesita para decidir. */
export interface AttendanceContext {
  /** Transacción del evento. Toda lectura y escritura del motor va por aquí. */
  tx: Database;
  /** `id` ya reservado de la fila de `rfid_events`; la fila aún no está insertada. */
  eventRowId: string;
  /** Hora del servidor: la verdad de la hora de entrada (RN8). */
  receivedAt: Date;
  device: AttendanceDevice;
  card: AttendanceCard;
  student: AttendanceStudent;
}

/** Decisión del motor para un carnet conocido. */
export interface AttendanceDecision {
  result: KnownCardResult;
  /** Sesión asociada, tal como viaja en la respuesta del contrato. `null` si no hay. */
  session: DeviceEventSession | null;
  /**
   * Escrituras que dependen de que la fila de `rfid_events` ya exista (típicamente la asistencia,
   * que la referencia por clave foránea). W2 la ejecuta en un SAVEPOINT de la misma transacción,
   * justo después de insertar el evento y **solo** si esta petición ganó la carrera de
   * idempotencia.
   *
   * Debe ser idempotente: una transacción puede reintentarse por errores serializables o por la
   * infraestructura de base de datos. Todas sus consultas deben usar exclusivamente el `tx`
   * recibido; conservar `context.tx` en el closure rompería el aislamiento del SAVEPOINT.
   */
  persist?: ((tx: Database) => Promise<void>) | undefined;
}

export type AttendanceEngine = (context: AttendanceContext) => Promise<AttendanceDecision>;

/**
 * Implementación provisional de la lane W2: la entrada queda registrada (RN1) pero no se busca
 * ninguna sesión, así que el resultado es siempre `no_session`.
 *
 * No es un `TODO` colgado: es el comportamiento correcto y completo del sistema mientras el motor
 * de sesiones (W4) no exista, y el contrato ya lo contempla («Entrada registrada (RN1) pero sin
 * sesión en ventana», `docs/device-contract.md`).
 */
export const noSessionAttendanceEngine: AttendanceEngine = () =>
  Promise.resolve({ result: 'no_session', session: null });
