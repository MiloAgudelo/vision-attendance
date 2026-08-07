/**
 * Cliente programático del contrato v1.
 *
 * Es la pieza principal del paquete: la CLI es solo una cáscara sobre esta clase, y W6 la usará
 * como biblioteca en las pruebas e2e. Por eso todo lo que toca el mundo exterior es inyectable
 * (`fetch`, reloj, esperas) y todo lo que entra y sale se valida con los esquemas de `@va/shared`.
 *
 * Regla de la lane: este paquete es un cliente EXTERNO de la API. Habla HTTP y nada más; no importa
 * `@va/db` ni nada de `apps/web`.
 */

import {
  DEVICE_AUTH_SCHEME,
  DEVICE_ERROR_HTTP_STATUS,
  DEVICE_EVENTS_PATH,
  deviceEventResponseSchema,
  isDeviceApiKeyShaped,
  type DeviceEventRequest,
  type DeviceEventResponse,
} from '@va/shared';

import { backoffForAttempt, isRetryableStatus, type SendAttempt } from './attempts.js';
import {
  ContractViolationError,
  IdempotencyViolationError,
  InvalidApiKeyError,
  TransportError,
  describeZodIssues,
} from './errors.js';
import {
  buildDeviceEvent,
  newEventId,
  randomCardUid,
  type BuildDeviceEventOptions,
  type CardUidBytes,
} from './event.js';

/** URL por defecto del servidor de desarrollo de `apps/web`. */
export const DEFAULT_BASE_URL = 'http://localhost:3000';

/** Tiempo límite por intento, en milisegundos (`docs/device-contract.md`: ~5 s). */
export const DEFAULT_TIMEOUT_MS = 5_000;

/** Máximo de intentos por lectura, contando el primero (contrato: 5). */
export const DEFAULT_MAX_ATTEMPTS = 5;

/** Espera antes del segundo intento; después se duplica: 1 s, 2 s, 4 s, 8 s. */
export const DEFAULT_INITIAL_BACKOFF_MS = 1_000;

/** Firma mínima de `fetch` que necesita el cliente; permite inyectar un doble en las pruebas. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DeviceSimulatorOptions {
  /** Credencial del dispositivo: `vad_<nombre>_<secreto>`. */
  apiKey: string;
  /** Base del servidor. Por defecto {@link DEFAULT_BASE_URL}. */
  baseUrl?: string | undefined;
  /**
   * Nombre del dispositivo que viaja en el cuerpo. Por defecto se deduce de la credencial, que es
   * justo lo que el servidor comprueba (si no coinciden, responde 403 `device_mismatch`).
   */
  deviceId?: string | undefined;
  fetch?: FetchLike | undefined;
  timeoutMs?: number | undefined;
  maxAttempts?: number | undefined;
  initialBackoffMs?: number | undefined;
  /** Espera inyectable; por defecto `setTimeout`. */
  sleep?: ((ms: number) => Promise<void>) | undefined;
  /** Reloj inyectable; por defecto `Date`. */
  now?: (() => Date) | undefined;
}

/** Opciones de una lectura, sin los datos que ya conoce el cliente (dispositivo y credencial). */
export type SendReadingOptions = Omit<BuildDeviceEventOptions, 'deviceId' | 'cardUid'> & {
  cardUid?: string | undefined;
  /** Longitud del UID generado cuando no se indica `cardUid`. */
  cardUidBytes?: CardUidBytes | undefined;
};

/**
 * Opciones de una ráfaga. No admite `cardUid` ni `eventId`: por definición cada lectura de la
 * ráfaga lleva los suyos, distintos de los de las demás.
 */
export type BurstOptions = Omit<SendReadingOptions, 'cardUid' | 'eventId'> & {
  /** Retardo entre lecturas consecutivas, en milisegundos. Se ignora si `concurrent` es `true`. */
  delayMs?: number | undefined;
  /**
   * Lanza todas las lecturas a la vez en lugar de una tras otra. Sirve para provocar carreras en el
   * servidor (creación perezosa de sesión, unicidad de asistencia) que la ejecución secuencial no
   * alcanza nunca.
   */
  concurrent?: boolean | undefined;
};

/** Opciones de un reenvío repetido del mismo evento (prueba de idempotencia). */
export type RepeatOptions = SendReadingOptions & {
  /** Retardo entre reenvíos consecutivos, en milisegundos. Se ignora si `concurrent` es `true`. */
  delayMs?: number | undefined;
  /**
   * Lanza los reenvíos simultáneamente en vez de en serie. Es la única forma de provocar la carrera
   * de dos peticiones con el mismo `eventId` llegando a la vez, que el servidor debe resolver con
   * una sola fila en `rfid_events` y dos respuestas idénticas.
   */
  concurrent?: boolean | undefined;
};

export interface SendOutcome {
  /** Cuerpo exacto que se envió (ya normalizado y validado). */
  readonly request: DeviceEventRequest;
  /** Código HTTP de la respuesta definitiva. */
  readonly status: number;
  /** Respuesta validada contra el contrato v1. */
  readonly response: DeviceEventResponse;
  /** Bitácora de todos los intentos, incluido el definitivo. */
  readonly attempts: readonly SendAttempt[];
  /** Duración total, desde el primer intento hasta la respuesta, en milisegundos. */
  readonly durationMs: number;
}

/** Extrae el nombre del dispositivo de una credencial `vad_<nombre>_<secreto>`. */
export function deviceNameFromApiKey(apiKey: string): string {
  if (!isDeviceApiKeyShaped(apiKey)) {
    throw new InvalidApiKeyError();
  }
  const name = apiKey.split('_')[1];
  if (name === undefined || name === '') {
    throw new InvalidApiKeyError();
  }
  return name;
}

/** Oculta el secreto de una credencial para poder imprimirla sin filtrarla. */
export function maskApiKey(apiKey: string): string {
  if (!isDeviceApiKeyShaped(apiKey)) {
    return '(credencial con forma inválida)';
  }
  return `${apiKey.split('_').slice(0, 2).join('_')}_…(secreto oculto)`;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (causa: ${error.cause.message})` : '';
    return `${error.message}${cause}`;
  }
  return String(error);
}

/** Recorta un cuerpo crudo para que quepa en un mensaje de error. */
function truncate(text: string, max = 500): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (${text.length} caracteres)`;
}

/**
 * Comprueba lo que el contrato exige de la respuesta más allá de la forma del cuerpo: el código
 * HTTP declarado para cada error y el eco del `eventId` enviado.
 */
function checkResponseAgainstContract(
  request: DeviceEventRequest,
  status: number,
  response: DeviceEventResponse,
): string[] {
  const issues: string[] = [];

  if (response.ok) {
    if (status !== 200) {
      issues.push(
        `una respuesta procesada (ok: true) debe usar HTTP 200; se recibió ${status}. ` +
          'El firmware decide LED y buzzer por "result", no por el código HTTP.',
      );
    }
    if (response.eventId !== request.eventId) {
      issues.push(
        `el "eventId" de la respuesta (${response.eventId}) no es el enviado ` +
          `(${request.eventId}); la idempotencia (RN7) se apoya en ese eco.`,
      );
    }
  } else {
    const expected = DEVICE_ERROR_HTTP_STATUS[response.error];
    if (status !== expected) {
      issues.push(
        `el error "${response.error}" se declara con HTTP ${expected} en el contrato; ` +
          `se recibió ${status}.`,
      );
    }
  }

  return issues;
}

/**
 * Simulador de dispositivo RFID: cliente HTTP del contrato v1.
 *
 * @example
 * ```ts
 * const simulator = new DeviceSimulator({ apiKey: 'vad_LAB-01_…' });
 * const outcome = await simulator.send({ cardUid: 'a1:b2:c3:d4' });
 * console.log(outcome.response);
 * ```
 */
export class DeviceSimulator {
  readonly baseUrl: string;
  readonly deviceId: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly initialBackoffMs: number;

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => Date;

  constructor(options: DeviceSimulatorOptions) {
    this.#apiKey = options.apiKey;
    this.deviceId = options.deviceId ?? deviceNameFromApiKey(options.apiKey);
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.#sleep = options.sleep ?? defaultSleep;
    this.#now = options.now ?? ((): Date => new Date());
  }

  /** URL completa del endpoint de ingesta. */
  get endpoint(): string {
    return `${this.baseUrl}${DEVICE_EVENTS_PATH}`;
  }

  /** Credencial con el secreto oculto, apta para imprimir. */
  get maskedApiKey(): string {
    return maskApiKey(this.#apiKey);
  }

  /** Construye el cuerpo de una lectura sin enviarlo (útil para inspeccionarlo o firmarlo). */
  buildReading(options: SendReadingOptions = {}): DeviceEventRequest {
    const { cardUid, cardUidBytes, ...rest } = options;
    return buildDeviceEvent({
      ...rest,
      deviceId: this.deviceId,
      cardUid: cardUid ?? randomCardUid(cardUidBytes ?? 4),
      now: rest.now ?? this.#now(),
    });
  }

  /**
   * Envía una lectura con la política de reintentos del contrato: tiempo límite por intento,
   * backoff exponencial y **siempre el mismo `eventId`**.
   *
   * @throws {TransportError} si se agotan los intentos sin obtener respuesta.
   * @throws {ContractViolationError} si el servidor responde algo que no cumple el contrato.
   */
  async send(options: SendReadingOptions = {}): Promise<SendOutcome> {
    return this.sendReading(this.buildReading(options));
  }

  /** Igual que {@link send}, pero con un cuerpo ya construido (por ejemplo, para reenviarlo tal cual). */
  async sendReading(request: DeviceEventRequest): Promise<SendOutcome> {
    const attempts: SendAttempt[] = [];
    const startedAt = Date.now();
    const body = JSON.stringify(request);

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const attemptStart = this.#now();
      const attemptStartedAtMs = Date.now();
      const isLast = attempt === this.maxAttempts;

      let status: number | null = null;
      let rawBody = '';
      let failure: { outcome: 'timeout' | 'network'; detail: string } | null = null;

      try {
        const response = await this.#fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: `${DEVICE_AUTH_SCHEME} ${this.#apiKey}`,
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        status = response.status;
        rawBody = await response.text();
      } catch (error) {
        failure = isAbortLike(error)
          ? {
              outcome: 'timeout',
              detail: `sin respuesta en ${this.timeoutMs} ms`,
            }
          : { outcome: 'network', detail: describeError(error) };
      }

      const durationMs = Date.now() - attemptStartedAtMs;

      // Fallo de transporte: se reintenta con el MISMO eventId (RN7).
      if (failure !== null || status === null) {
        const detail = failure?.detail ?? 'sin respuesta';
        const outcome = failure?.outcome ?? 'network';
        if (isLast) {
          attempts.push({
            attempt,
            startedAt: attemptStart.toISOString(),
            durationMs,
            status: null,
            outcome,
            detail,
            backoffMs: null,
          });
          throw new TransportError(
            `No se obtuvo respuesta de ${this.endpoint} tras ${this.maxAttempts} intentos ` +
              `(último fallo: ${detail}).`,
            attempts,
          );
        }
        const backoffMs = backoffForAttempt(attempt, this.initialBackoffMs);
        attempts.push({
          attempt,
          startedAt: attemptStart.toISOString(),
          durationMs,
          status: null,
          outcome,
          detail,
          backoffMs,
        });
        await this.#sleep(backoffMs);
        continue;
      }

      // Código reintentable (429 / 5xx): se reintenta sin mirar el cuerpo todavía.
      if (!isLast && isRetryableStatus(status)) {
        const backoffMs = backoffForAttempt(attempt, this.initialBackoffMs);
        attempts.push({
          attempt,
          startedAt: attemptStart.toISOString(),
          durationMs,
          status,
          outcome: 'retryable-status',
          detail: `HTTP ${status}, reintentable según el contrato`,
          backoffMs,
        });
        await this.#sleep(backoffMs);
        continue;
      }

      attempts.push({
        attempt,
        startedAt: attemptStart.toISOString(),
        durationMs,
        status,
        outcome: 'ok',
        detail: null,
        backoffMs: null,
      });

      const response = this.#parseResponse(request, status, rawBody);
      return {
        request,
        status,
        response,
        attempts,
        durationMs: Date.now() - startedAt,
      };
    }

    /* c8 ignore next 4 -- inalcanzable: el bucle sale por return o por TransportError. */
    throw new TransportError(
      `No se obtuvo respuesta de ${this.endpoint} tras ${this.maxAttempts} intentos.`,
      attempts,
    );
  }

  /**
   * Reenvía la MISMA lectura `times` veces, reutilizando el `eventId`. Prueba de idempotencia
   * (RN7): el servidor debe devolver la respuesta original almacenada y no duplicar asistencia.
   */
  async repeat(
    times: number,
    options: RepeatOptions = {},
    onOutcome?: (outcome: SendOutcome, index: number) => void,
  ): Promise<SendOutcome[]> {
    const { delayMs = 0, concurrent = false, ...reading } = options;
    const request = this.buildReading({ ...reading, eventId: reading.eventId ?? newEventId() });

    let outcomes: SendOutcome[];
    if (concurrent) {
      // Todas a la vez: es lo que provoca la carrera en el servidor. El orden de resolución no es
      // determinista, así que no se notifica hasta tenerlas todas.
      outcomes = await Promise.all(Array.from({ length: times }, () => this.sendReading(request)));
      outcomes.forEach((outcome, index) => onOutcome?.(outcome, index));
    } else {
      outcomes = [];
      for (let index = 0; index < times; index += 1) {
        if (index > 0 && delayMs > 0) {
          await this.#sleep(delayMs);
        }
        const outcome = await this.sendReading(request);
        outcomes.push(outcome);
        onOutcome?.(outcome, index);
      }
    }

    this.#assertIdempotent(request.eventId, outcomes);
    return outcomes;
  }

  /**
   * Comprueba RN7: todas las respuestas al mismo `eventId` deben ser idénticas a la primera.
   *
   * Sin esta comprobación el comando sería teatro: enviaría el mismo evento N veces y daría por
   * bueno cualquier conjunto de respuestas, incluido el de un servidor que reprocesa el evento.
   */
  #assertIdempotent(eventId: string, outcomes: readonly SendOutcome[]): void {
    const first = outcomes[0];
    if (first === undefined) return;
    const reference = JSON.stringify(first.response);
    for (let index = 1; index < outcomes.length; index += 1) {
      const current = outcomes[index];
      if (current === undefined) continue;
      if (JSON.stringify(current.response) !== reference) {
        throw new IdempotencyViolationError({
          eventId,
          index,
          first: first.response,
          received: current.response,
        });
      }
    }
  }

  /**
   * Envía `count` lecturas DISTINTAS (UID y `eventId` nuevos en cada una) con `delayMs` entre ellas.
   * Simula una fila de estudiantes pasando el carnet al entrar a clase.
   */
  async burst(
    count: number,
    options: BurstOptions = {},
    onOutcome?: (outcome: SendOutcome, index: number) => void,
  ): Promise<SendOutcome[]> {
    const { delayMs = 0, concurrent = false, ...reading } = options;

    if (concurrent) {
      // Cada lectura sigue siendo distinta (UID y eventId propios); lo que se simula aquí es una
      // fila de estudiantes pasando el carnet a la vez, que es lo que pone a prueba la creación
      // perezosa de la sesión bajo concurrencia.
      const outcomes = await Promise.all(Array.from({ length: count }, () => this.send(reading)));
      outcomes.forEach((outcome, index) => onOutcome?.(outcome, index));
      return outcomes;
    }

    const outcomes: SendOutcome[] = [];
    for (let index = 0; index < count; index += 1) {
      if (index > 0 && delayMs > 0) {
        await this.#sleep(delayMs);
      }
      // Cada vuelta genera su propio UID y su propio `eventId`: son lecturas distintas.
      const outcome = await this.send(reading);
      outcomes.push(outcome);
      onOutcome?.(outcome, index);
    }
    return outcomes;
  }

  /**
   * Modo enrolamiento: envía un UID nuevo (aleatorio si no se indica) para que el servidor lo
   * capture. El resultado esperado es `enrollment_captured` si el dispositivo está en modo
   * enrolamiento, o `unknown_card` si está en modo normal.
   */
  async enroll(options: SendReadingOptions = {}): Promise<SendOutcome> {
    // Delega sin fijar el UID: `send` ya genera uno aleatorio respetando `cardUidBytes`, que es lo
    // que permite enrolar carnets MIFARE de 7 bytes y no solo los de 4.
    return this.send(options);
  }

  /** Valida el cuerpo recibido contra el contrato v1 y lo devuelve tipado. */
  #parseResponse(
    request: DeviceEventRequest,
    status: number,
    rawBody: string,
  ): DeviceEventResponse {
    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      throw new ContractViolationError({
        status,
        issues: [`el cuerpo no es JSON válido. Se recibió: ${truncate(JSON.stringify(rawBody))}`],
        body: undefined,
        rawBody,
      });
    }

    const parsed = deviceEventResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ContractViolationError({
        status,
        issues: describeZodIssues(parsed.error),
        body,
        rawBody,
      });
    }

    const issues = checkResponseAgainstContract(request, status, parsed.data);
    if (issues.length > 0) {
      throw new ContractViolationError({ status, issues, body, rawBody });
    }

    return parsed.data;
  }
}

/** Atajo funcional equivalente a `new DeviceSimulator(options)`. */
export function createDeviceSimulator(options: DeviceSimulatorOptions): DeviceSimulator {
  return new DeviceSimulator(options);
}
