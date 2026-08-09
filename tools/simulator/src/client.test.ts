import { describe, expect, it } from 'vitest';

import { DEVICE_EVENTS_PATH, type DeviceEventRequest } from '@va/shared';

import {
  DEFAULT_MAX_ATTEMPTS,
  DeviceSimulator,
  createDeviceSimulator,
  deviceNameFromApiKey,
  maskApiKey,
  type FetchLike,
} from './client.js';
import {
  ContractViolationError,
  IdempotencyViolationError,
  InvalidApiKeyError,
  InvalidEventError,
  TransportError,
} from './errors.js';

const API_KEY = 'vad_LAB-DESARROLLO-01_s3cr3to-de-alta-entropia';
const UID = 'A1B2C3D4';

/** Espera inyectada: registra las esperas en vez de dormir de verdad. */
function recordingSleep(): { sleeps: number[]; sleep: (ms: number) => Promise<void> } {
  const sleeps: number[] = [];
  return {
    sleeps,
    sleep: (ms: number): Promise<void> => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
}

/** Respuesta 200 conforme al contrato, con el `eventId` de la petición. */
function successBody(
  request: DeviceEventRequest,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    ok: true,
    eventId: request.eventId,
    result: 'registered',
    receivedAt: '2026-08-10T18:05:13.412Z',
    message: 'Asistencia registrada',
    student: { code: '202410123', name: 'Ana Gómez' },
    session: null,
    ...overrides,
  };
}

interface Recorded {
  url: string;
  init: RequestInit;
  body: DeviceEventRequest;
}

/**
 * Construye un `fetch` inyectado a partir de una lista de guiones. Cada guion recibe la petición
 * ya parseada y devuelve una `Response` o lanza (fallo de red / timeout).
 */
function scriptedFetch(
  steps: ReadonlyArray<(request: DeviceEventRequest, call: number) => Response>,
): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch: FetchLike = (url, init) => {
    const body = JSON.parse(String(init.body)) as DeviceEventRequest;
    calls.push({ url, init, body });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === undefined) {
      throw new Error('Guion de fetch vacío');
    }
    return Promise.resolve(step(body, calls.length));
  };
  return { fetch, calls };
}

function networkFailure(): never {
  throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED 127.0.0.1:3000') });
}

function timeoutFailure(): never {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  throw error;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('credencial del dispositivo', () => {
  it('deduce el nombre del dispositivo de la credencial', () => {
    expect(deviceNameFromApiKey(API_KEY)).toBe('LAB-DESARROLLO-01');
  });

  it('rechaza una credencial con forma inválida', () => {
    expect(() => deviceNameFromApiKey('token-cualquiera')).toThrow(InvalidApiKeyError);
    expect(() => new DeviceSimulator({ apiKey: 'nope' })).toThrow(InvalidApiKeyError);
  });

  it('oculta el secreto al imprimir la credencial', () => {
    expect(maskApiKey(API_KEY)).toBe('vad_LAB-DESARROLLO-01_…(secreto oculto)');
    expect(maskApiKey(API_KEY)).not.toContain('s3cr3to');
  });
});

describe('send — petición', () => {
  it('hace POST al endpoint del contrato con la credencial en Authorization', async () => {
    const { fetch, calls } = scriptedFetch([(request) => jsonResponse(successBody(request))]);
    const simulator = createDeviceSimulator({
      apiKey: API_KEY,
      baseUrl: 'http://localhost:3000/',
      fetch,
    });

    const outcome = await simulator.send({ cardUid: 'a1:b2:c3:d4', now: new Date() });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(`http://localhost:3000${DEVICE_EVENTS_PATH}`);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    });
    expect(call?.body.cardUid).toBe(UID);
    expect(call?.body.deviceId).toBe('LAB-DESARROLLO-01');
    expect(outcome.response.ok).toBe(true);
    expect(outcome.attempts).toHaveLength(1);
  });

  it('no envía nada cuando la lectura no cumple el contrato', async () => {
    const { fetch, calls } = scriptedFetch([(request) => jsonResponse(successBody(request))]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    await expect(simulator.send({ cardUid: 'NO-ES-HEX' })).rejects.toThrow(InvalidEventError);
    expect(calls).toHaveLength(0);
  });
});

describe('send — reintentos con backoff (RN7)', () => {
  it('reintenta tras un fallo de red y reutiliza el MISMO eventId', async () => {
    const { fetch, calls } = scriptedFetch([
      () => networkFailure(),
      () => timeoutFailure(),
      (request) => jsonResponse(successBody(request)),
    ]);
    const { sleeps, sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    const outcome = await simulator.send({ cardUid: UID });

    expect(calls).toHaveLength(3);
    const eventIds = new Set(calls.map((call) => call.body.eventId));
    expect(eventIds.size).toBe(1);
    expect(outcome.request.eventId).toBe(calls[0]?.body.eventId);

    // Backoff exponencial del contrato: 1 s, 2 s, …
    expect(sleeps).toEqual([1000, 2000]);
    expect(outcome.attempts.map((attempt) => attempt.outcome)).toEqual([
      'network',
      'timeout',
      'ok',
    ]);
    expect(outcome.attempts[0]?.detail).toContain('ECONNREFUSED');
  });

  it('se detiene tras 5 intentos y reporta la escalera completa 1-2-4-8 s', async () => {
    const { fetch, calls } = scriptedFetch([() => networkFailure()]);
    const { sleeps, sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    let thrown: unknown;
    try {
      await simulator.send({ cardUid: UID });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TransportError);
    const error = thrown as TransportError;
    expect(calls).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(error.attempts).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(sleeps).toEqual([1000, 2000, 4000, 8000]);
    expect(new Set(calls.map((call) => call.body.eventId)).size).toBe(1);
    expect(error.message).toContain('5 intentos');
  });

  it('reintenta los códigos que el contrato marca como reintentables (429, 5xx)', async () => {
    const { fetch, calls } = scriptedFetch([
      () => jsonResponse({ ok: false, error: 'rate_limited', message: 'Demasiadas' }, 429),
      () => jsonResponse({ ok: false, error: 'internal_error', message: 'Fallo' }, 500),
      (request) => jsonResponse(successBody(request)),
    ]);
    const { sleeps, sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    const outcome = await simulator.send({ cardUid: UID });

    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000]);
    expect(outcome.status).toBe(200);
  });

  it('no reintenta los errores definitivos: 401 se devuelve al primer intento', async () => {
    const { fetch, calls } = scriptedFetch([
      () => jsonResponse({ ok: false, error: 'invalid_credentials', message: 'Inválidas' }, 401),
    ]);
    const { sleeps, sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    const outcome = await simulator.send({ cardUid: UID });

    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(outcome.status).toBe(401);
    expect(outcome.response).toEqual({
      ok: false,
      error: 'invalid_credentials',
      message: 'Inválidas',
    });
  });

  it('devuelve el último error del servidor cuando se agotan los intentos con respuesta HTTP', async () => {
    const { fetch, calls } = scriptedFetch([
      () => jsonResponse({ ok: false, error: 'internal_error', message: 'Fallo' }, 500),
    ]);
    const { sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    const outcome = await simulator.send({ cardUid: UID });

    expect(calls).toHaveLength(DEFAULT_MAX_ATTEMPTS);
    expect(outcome.status).toBe(500);
    expect(outcome.response.ok).toBe(false);
  });

  it('aborta de verdad la petición cuando se supera el tiempo límite', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('abortada');
          error.name = 'TimeoutError';
          reject(error);
        });
      });
    const { sleep } = recordingSleep();
    const simulator = new DeviceSimulator({
      apiKey: API_KEY,
      fetch,
      sleep,
      timeoutMs: 15,
      maxAttempts: 2,
    });

    await expect(simulator.send({ cardUid: UID })).rejects.toThrow(TransportError);
  });
});

describe('send — validación de la respuesta contra el contrato', () => {
  it('detecta un cuerpo que no valida contra los esquemas de @va/shared', async () => {
    const { fetch } = scriptedFetch([
      (request) => jsonResponse({ ...(successBody(request) as object), result: 'inventado' }),
    ]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    let thrown: unknown;
    try {
      await simulator.send({ cardUid: UID });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as ContractViolationError).issues.join(' ')).toContain('result');
  });

  it('detecta que falta un campo obligatorio de la respuesta', async () => {
    const { fetch } = scriptedFetch([
      (request) =>
        jsonResponse({
          ok: true,
          eventId: request.eventId,
          result: 'registered',
          receivedAt: '2026-08-10T18:05:13.412Z',
          message: 'Asistencia registrada',
          // faltan `student` y `session`, que el contrato exige (aunque sean null)
        }),
    ]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    await expect(simulator.send({ cardUid: UID })).rejects.toThrow(ContractViolationError);
  });

  it('detecta un cuerpo que ni siquiera es JSON', async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(new Response('<html>502 Bad Gateway</html>', { status: 400 }));
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    let thrown: unknown;
    try {
      await simulator.send({ cardUid: UID });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as ContractViolationError).issues.join(' ')).toContain('no es JSON válido');
  });

  it('detecta un código HTTP que no corresponde al error declarado', async () => {
    const { fetch } = scriptedFetch([
      () => jsonResponse({ ok: false, error: 'device_revoked', message: 'Revocado' }, 401),
    ]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    let thrown: unknown;
    try {
      await simulator.send({ cardUid: UID });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as ContractViolationError).issues.join(' ')).toContain('HTTP 403');
  });

  it('detecta que la respuesta no devuelve el eventId enviado (la idempotencia depende de él)', async () => {
    const { fetch } = scriptedFetch([
      () =>
        jsonResponse(
          successBody({ eventId: '00000000-0000-4000-8000-000000000000' } as DeviceEventRequest),
        ),
    ]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    let thrown: unknown;
    try {
      await simulator.send({ cardUid: UID });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as ContractViolationError).issues.join(' ')).toContain('eventId');
  });

  it('detecta una respuesta procesada que no usa HTTP 200', async () => {
    const { fetch } = scriptedFetch([(request) => jsonResponse(successBody(request), 201)]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    await expect(simulator.send({ cardUid: UID })).rejects.toThrow(ContractViolationError);
  });
});

describe('repeat — idempotencia', () => {
  it('envía la misma lectura N veces con el mismo eventId y el mismo cuerpo', async () => {
    // El servidor correcto devuelve SIEMPRE la respuesta original almacenada (RN7), así que las
    // tres respuestas son idénticas. Un doble que fuera variando el `result` describiría a un
    // servidor que reprocesa el evento, que es justo lo que este comando debe delatar.
    const { fetch, calls } = scriptedFetch([(request) => jsonResponse(successBody(request))]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    const outcomes = await simulator.repeat(3, { cardUid: UID });

    expect(calls).toHaveLength(3);
    const bodies = calls.map((call) => JSON.stringify(call.body));
    expect(new Set(bodies).size).toBe(1);
    expect(outcomes).toHaveLength(3);
    expect(
      outcomes.map((outcome) => (outcome.response.ok ? outcome.response.result : null)),
    ).toEqual(['registered', 'registered', 'registered']);
  });

  it('delata al servidor que no devuelve la respuesta original almacenada', async () => {
    // Violación de RN7 más frecuente: el servidor reprocesa el evento en vez de releer
    // `rfid_events.response`, y responde `already_registered` donde antes respondió `registered`.
    const { fetch } = scriptedFetch([
      (request, call) =>
        jsonResponse(successBody(request, call === 1 ? {} : { result: 'already_registered' })),
    ]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    await expect(simulator.repeat(3, { cardUid: UID })).rejects.toThrow(IdempotencyViolationError);
  });

  it('espera entre reenvíos cuando se pide retardo', async () => {
    const { fetch } = scriptedFetch([(request) => jsonResponse(successBody(request))]);
    const { sleeps, sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    await simulator.repeat(3, { cardUid: UID, delayMs: 250 });

    // 2 esperas para 3 reenvíos: solo entre ellos.
    expect(sleeps).toEqual([250, 250]);
  });

  it('con --concurrentes lanza los reenvíos a la vez y no espera', async () => {
    // La carrera de dos peticiones con el mismo eventId es inalcanzable en serie, y es exactamente
    // la que el servidor debe resolver con una sola fila en rfid_events (W2/W4).
    const { fetch, calls } = scriptedFetch([(request) => jsonResponse(successBody(request))]);
    const { sleeps, sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    const outcomes = await simulator.repeat(4, { cardUid: UID, concurrent: true });

    expect(outcomes).toHaveLength(4);
    expect(new Set(calls.map((call) => call.body.eventId)).size).toBe(1);
    expect(sleeps).toEqual([]);
  });
});

describe('burst — ráfaga de lecturas distintas', () => {
  it('genera un UID y un eventId nuevos por lectura y espera entre ellas', async () => {
    const { fetch, calls } = scriptedFetch([(request) => jsonResponse(successBody(request))]);
    const { sleeps, sleep } = recordingSleep();
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch, sleep });

    const outcomes = await simulator.burst(4, { delayMs: 250 });

    expect(outcomes).toHaveLength(4);
    expect(new Set(calls.map((call) => call.body.cardUid)).size).toBe(4);
    expect(new Set(calls.map((call) => call.body.eventId)).size).toBe(4);
    // Retardo entre lecturas: 3 esperas para 4 lecturas.
    expect(sleeps).toEqual([250, 250, 250]);
  });

  it('respeta la longitud de UID pedida', async () => {
    const { fetch, calls } = scriptedFetch([(request) => jsonResponse(successBody(request))]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    await simulator.burst(2, { cardUidBytes: 7 });

    for (const call of calls) {
      expect(call.body.cardUid).toMatch(/^[0-9A-F]{14}$/);
    }
  });
});

describe('enroll — modo enrolamiento', () => {
  it('envía un UID nuevo y devuelve el result del servidor', async () => {
    const { fetch, calls } = scriptedFetch([
      (request) =>
        jsonResponse(
          successBody(request, {
            result: 'enrollment_captured',
            message: 'Carnet capturado',
            student: null,
          }),
        ),
    ]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    const outcome = await simulator.enroll();

    expect(calls[0]?.body.cardUid).toMatch(/^[0-9A-F]{8}$/);
    expect(outcome.response.ok && outcome.response.result).toBe('enrollment_captured');
  });

  it('respeta la longitud de UID pedida', async () => {
    // Enrolar carnets MIFARE de 7 bytes es un caso real: antes `enroll` fijaba el UID a 4 bytes
    // antes de delegar, así que `--bytes 7` se ignoraba en silencio.
    const { fetch, calls } = scriptedFetch([
      (request) => jsonResponse(successBody(request, { result: 'enrollment_captured' })),
    ]);
    const simulator = new DeviceSimulator({ apiKey: API_KEY, fetch });

    await simulator.enroll({ cardUidBytes: 7 });

    expect(calls[0]?.body.cardUid).toMatch(/^[0-9A-F]{14}$/);
  });
});
