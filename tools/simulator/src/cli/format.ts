/**
 * Formato de la salida en español.
 *
 * Funciones puras que devuelven líneas de texto; quien las imprime es {@link runCli}. Así la
 * salida se puede comprobar en pruebas sin capturar la consola.
 */

import type { DeviceEventRequest, EventResult } from '@va/shared';

import type { SendAttempt } from '../attempts.js';
import type { SendOutcome } from '../client.js';
import { ContractViolationError, SimulatorError, TransportError } from '../errors.js';

/** Descripción corta de cada `result`, para acompañar al mensaje del servidor. */
const RESULT_HINTS: Record<EventResult, string> = {
  registered: 'asistencia creada en la sesión',
  already_registered: 'ya había asistencia en esta sesión (RN6)',
  no_session: 'entrada registrada (RN1), sin sesión en ventana',
  not_enrolled: 'entrada registrada; el estudiante no está inscrito en el grupo',
  unknown_card: 'carnet no asociado a ningún estudiante',
  enrollment_captured: 'UID capturado para asociarlo desde la web',
  error: 'error interno; la lectura quedó registrada',
};

function indentJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

/** Cabecera con el destino y la credencial enmascarada. */
export function formatTarget(endpoint: string, maskedApiKey: string, deviceId: string): string[] {
  return [`Destino     POST ${endpoint}`, `Dispositivo ${deviceId}`, `Credencial  ${maskedApiKey}`];
}

/** Petición enviada, con el cuerpo completo. */
export function formatRequest(request: DeviceEventRequest, label?: string): string[] {
  return [
    '',
    label === undefined ? 'Petición enviada' : `Petición enviada (${label})`,
    indentJson(request),
  ];
}

function formatAttempt(attempt: SendAttempt): string {
  const status = attempt.status === null ? 'sin respuesta' : `HTTP ${attempt.status}`;
  const detail = attempt.detail === null ? '' : ` — ${attempt.detail}`;
  const backoff =
    attempt.backoffMs === null ? '' : ` → espera ${attempt.backoffMs} ms antes de reintentar`;
  return `  intento ${attempt.attempt}: ${status} en ${attempt.durationMs} ms${detail}${backoff}`;
}

/** Bitácora de intentos; solo interesa cuando hubo más de uno. */
export function formatAttempts(attempts: readonly SendAttempt[]): string[] {
  if (attempts.length <= 1) {
    return [];
  }
  return [
    '',
    `Intentos (${attempts.length}, todos con el mismo eventId — RN7)`,
    ...attempts.map(formatAttempt),
  ];
}

/** Respuesta recibida: código HTTP, resultado, mensaje y cuerpo completo. */
export function formatOutcome(outcome: SendOutcome): string[] {
  const lines: string[] = ['', `Respuesta   HTTP ${outcome.status} en ${outcome.durationMs} ms`];

  if (outcome.response.ok) {
    const hint = RESULT_HINTS[outcome.response.result];
    lines.push(`Resultado   ${outcome.response.result} (${hint})`);
    lines.push(`Mensaje     ${outcome.response.message}`);
    lines.push(`Recibido    ${outcome.response.receivedAt} (hora oficial del servidor, RN8)`);
    if (outcome.response.student !== null) {
      lines.push(`Estudiante  ${outcome.response.student.name} (${outcome.response.student.code})`);
    }
    if (outcome.response.session !== null) {
      lines.push(
        `Sesión      ${outcome.response.session.id} (inicio ${outcome.response.session.scheduledStart})`,
      );
    }
  } else {
    lines.push(`Error       ${outcome.response.error}`);
    lines.push(`Mensaje     ${outcome.response.message}`);
  }

  lines.push('', 'Cuerpo completo de la respuesta', indentJson(outcome.response));
  return lines;
}

/** Explicación de un fallo, ya en el vocabulario del contrato. */
export function formatFailure(error: unknown): string[] {
  if (error instanceof ContractViolationError) {
    return [
      '',
      'VIOLACIÓN DE CONTRATO',
      error.message,
      '',
      'Cuerpo crudo recibido',
      indentJson(error.rawBody),
    ];
  }
  if (error instanceof TransportError) {
    return ['', 'SIN RESPUESTA', error.message, ...formatAttempts(error.attempts)];
  }
  if (error instanceof SimulatorError) {
    return ['', 'ERROR', error.message];
  }
  return ['', 'ERROR INESPERADO', error instanceof Error ? error.message : String(error)];
}

/** Resumen de una serie de envíos (repetir / rafaga). */
export function formatSummary(outcomes: readonly SendOutcome[]): string[] {
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    const key = outcome.response.ok ? outcome.response.result : `error:${outcome.response.error}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const detail = [...counts.entries()].map(([key, count]) => `${key} ×${count}`).join(', ');
  return ['', `Resumen     ${outcomes.length} lectura(s): ${detail}`];
}
