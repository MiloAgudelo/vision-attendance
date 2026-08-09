/**
 * Construcción y serialización de las respuestas del contrato del dispositivo.
 *
 * Existe un motivo concreto para centralizarlo: la respuesta de un evento se guarda en
 * `rfid_events.response` (jsonb) y se reenvía **idéntica** en cada reintento (RN7). PostgreSQL no
 * conserva el orden de las claves en `jsonb`, así que si la primera respuesta se serializara con el
 * orden del constructor y el replay con el orden que devuelve la base, los dos cuerpos serían
 * equivalentes pero **no byte a byte iguales**. {@link toWireResponse} impone un orden canónico a
 * los dos caminos.
 */

import {
  DEVICE_ERROR_HTTP_STATUS,
  DEVICE_ERROR_MESSAGES,
  EVENT_RESULT_MESSAGES,
  deviceEventSuccessResponseSchema,
  type DeviceErrorCode,
  type DeviceEventErrorResponse,
  type DeviceEventSession,
  type DeviceEventStudent,
  type DeviceEventSuccessResponse,
  type EventResult,
} from '@va/shared';

/** Lo que el endpoint acaba escribiendo: un código HTTP y un cuerpo JSON. */
export interface DeviceEventHttpResult {
  status: number;
  /** `unknown` y no `DeviceEventResponse`: en un replay se devuelve el jsonb almacenado tal cual. */
  body: unknown;
}

/** Respuesta de error del contrato, con su código HTTP y su mensaje en español. */
export function deviceErrorResult(error: DeviceErrorCode): DeviceEventHttpResult {
  const body: DeviceEventErrorResponse = {
    ok: false,
    error,
    message: DEVICE_ERROR_MESSAGES[error],
  };
  return { status: DEVICE_ERROR_HTTP_STATUS[error], body };
}

export interface BuildSuccessResponseInput {
  eventId: string;
  result: EventResult;
  receivedAt: Date;
  student?: DeviceEventStudent | null;
  session?: DeviceEventSession | null;
}

/** Respuesta 200 del contrato para un evento procesado, con el mensaje en español del `result`. */
export function buildSuccessResponse(input: BuildSuccessResponseInput): DeviceEventSuccessResponse {
  return toWireResponse({
    ok: true,
    eventId: input.eventId,
    result: input.result,
    receivedAt: input.receivedAt.toISOString(),
    message: EVENT_RESULT_MESSAGES[input.result],
    student: input.student ?? null,
    session: input.session ?? null,
  });
}

/**
 * Reconstruye la respuesta con un orden de claves fijo.
 *
 * Es lo que garantiza que la respuesta original y su replay salgan byte a byte iguales, vengan de
 * donde vengan (del constructor o de `rfid_events.response`).
 */
export function toWireResponse(response: DeviceEventSuccessResponse): DeviceEventSuccessResponse {
  return {
    ok: true,
    eventId: response.eventId,
    result: response.result,
    receivedAt: response.receivedAt,
    message: response.message,
    student: response.student ? { code: response.student.code, name: response.student.name } : null,
    session: response.session
      ? { id: response.session.id, scheduledStart: response.session.scheduledStart }
      : null,
  };
}

/**
 * Devuelve la respuesta almacenada de un evento ya procesado (RN7).
 *
 * Si el jsonb guardado cumple el contrato se recanoniza para que sea idéntica a la original; si no
 * lo cumple —una respuesta escrita por una versión anterior del contrato— se devuelve **tal cual**,
 * porque la regla es reenviar lo que se respondió, no reinterpretarlo.
 */
export function replayStoredResponse(stored: unknown): DeviceEventHttpResult {
  const parsed = deviceEventSuccessResponseSchema.safeParse(stored);
  return { status: 200, body: parsed.success ? toWireResponse(parsed.data) : stored };
}
