/**
 * Errores del simulador.
 *
 * Todos heredan de {@link SimulatorError} para que un consumidor (la CLI, o las pruebas e2e de W6)
 * pueda distinguir un fallo del simulador de cualquier otra excepción.
 */

import type { z } from 'zod';

import type { SendAttempt } from './attempts.js';

/** Base de todos los errores del simulador. */
export class SimulatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulatorError';
  }
}

/** Convierte los problemas de un `ZodError` en líneas legibles `campo: mensaje`. */
export function describeZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(raíz)';
    return `${path}: ${issue.message}`;
  });
}

/**
 * El cuerpo que el simulador iba a enviar no cumple el contrato v1.
 *
 * Se detecta ANTES de la petición: el simulador nunca manda a la red algo que él mismo sabe
 * inválido, porque entonces no estaría probando el servidor sino su propio error.
 */
export class InvalidEventError extends SimulatorError {
  readonly issues: string[];
  readonly candidate: unknown;

  constructor(candidate: unknown, error: z.ZodError) {
    const issues = describeZodIssues(error);
    super(`La lectura no cumple el contrato v1:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidEventError';
    this.issues = issues;
    this.candidate = candidate;
  }
}

/** La credencial no tiene la forma `vad_<nombre>_<secreto>` del contrato. */
export class InvalidApiKeyError extends SimulatorError {
  constructor() {
    super(
      'La credencial no tiene la forma del contrato (vad_<nombre-del-dispositivo>_<secreto>). ' +
        'La genera la web al dar de alta el dispositivo y se muestra una sola vez.',
    );
    this.name = 'InvalidApiKeyError';
  }
}

/**
 * El servidor respondió algo que NO cumple el contrato v1.
 *
 * Este es el valor del simulador como prueba de contrato: cualquier desviación (cuerpo que no
 * valida contra los esquemas de `@va/shared`, código HTTP que no corresponde al error declarado,
 * `eventId` distinto del enviado) se reporta aquí en vez de pasar desapercibida.
 */
export class ContractViolationError extends SimulatorError {
  readonly status: number;
  readonly issues: string[];
  readonly body: unknown;
  readonly rawBody: string;

  constructor(params: { status: number; issues: string[]; body: unknown; rawBody: string }) {
    super(
      `El servidor respondió algo que no cumple el contrato v1 (HTTP ${params.status}):\n  - ` +
        params.issues.join('\n  - '),
    );
    this.name = 'ContractViolationError';
    this.status = params.status;
    this.issues = params.issues;
    this.body = params.body;
    this.rawBody = params.rawBody;
  }
}

/**
 * El servidor rompió la idempotencia (RN7): un `eventId` ya procesado debe devolver **la respuesta
 * original almacenada, byte a byte**, y este reenvío devolvió otra cosa.
 *
 * Es el defecto que el simulador existe para detectar. El caso típico es un servidor que reprocesa
 * el evento en vez de releer `rfid_events.response`, y responde `already_registered` donde la
 * primera vez respondió `registered`.
 */
export class IdempotencyViolationError extends SimulatorError {
  readonly eventId: string;
  readonly index: number;
  readonly first: unknown;
  readonly received: unknown;

  constructor(params: { eventId: string; index: number; first: unknown; received: unknown }) {
    super(
      `El reenvío ${params.index + 1} del evento ${params.eventId} devolvió una respuesta distinta ` +
        `de la original, y el contrato v1 exige que sea idéntica (RN7).\n` +
        `  original: ${JSON.stringify(params.first)}\n` +
        `  recibida: ${JSON.stringify(params.received)}`,
    );
    this.name = 'IdempotencyViolationError';
    this.eventId = params.eventId;
    this.index = params.index;
    this.first = params.first;
    this.received = params.received;
  }
}

/** No se logró obtener respuesta del servidor tras agotar los reintentos del contrato. */
export class TransportError extends SimulatorError {
  readonly attempts: readonly SendAttempt[];

  constructor(message: string, attempts: readonly SendAttempt[]) {
    super(message);
    this.name = 'TransportError';
    this.attempts = attempts;
  }
}
