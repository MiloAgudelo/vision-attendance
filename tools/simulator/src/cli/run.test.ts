import { describe, expect, it } from 'vitest';

import type { DeviceEventRequest } from '@va/shared';

import type { FetchLike } from '../client.js';
import { EXIT_CODES } from './exit-codes.js';
import { runCli, type CliDependencies } from './run.js';

const KEY = 'vad_LAB-DESARROLLO-01_s3cr3to-de-alta-entropia';
const UID = 'A1B2C3D4';

interface Harness {
  deps: CliDependencies;
  stdout: () => string;
  stderr: () => string;
  bodies: DeviceEventRequest[];
}

function harness(fetch: FetchLike): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const bodies: DeviceEventRequest[] = [];
  const recordingFetch: FetchLike = (url, init) => {
    bodies.push(JSON.parse(String(init.body)) as DeviceEventRequest);
    return fetch(url, init);
  };
  return {
    deps: {
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      env: {},
      fetch: recordingFetch,
      sleep: () => Promise.resolve(),
    },
    stdout: () => out.join('\n'),
    stderr: () => err.join('\n'),
    bodies,
  };
}

function successResponse(overrides: Record<string, unknown> = {}): FetchLike {
  return (_url, init) => {
    const request = JSON.parse(String(init.body)) as DeviceEventRequest;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          eventId: request.eventId,
          result: 'registered',
          receivedAt: '2026-08-10T18:05:13.412Z',
          message: 'Asistencia registrada',
          student: { code: '202410123', name: 'Ana Gómez' },
          session: null,
          ...overrides,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  };
}

describe('runCli — ayuda y errores de uso', () => {
  it('imprime la ayuda en español y sale con 0', async () => {
    const test = harness(successResponse());
    const code = await runCli(['--help'], test.deps);

    expect(code).toBe(EXIT_CODES.ok);
    expect(test.stdout()).toContain('Simulador de dispositivo RFID');
    expect(test.stdout()).toContain('Comandos');
    expect(test.stdout()).toContain('enrolar');
  });

  it('devuelve 64 y explica el problema cuando los argumentos están mal', async () => {
    const test = harness(successResponse());
    const code = await runCli(['enviar', '--key', KEY], test.deps);

    expect(code).toBe(EXIT_CODES.usage);
    expect(test.stderr()).toContain('--uid');
    expect(test.bodies).toHaveLength(0);
  });
});

describe('runCli — salida legible', () => {
  it('muestra destino, petición, código HTTP, result, message y cuerpo completo', async () => {
    const test = harness(successResponse());
    const code = await runCli(['enviar', '--key', KEY, '--uid', 'a1:b2:c3:d4'], test.deps);
    const output = test.stdout();

    expect(code).toBe(EXIT_CODES.ok);
    expect(output).toContain('POST http://localhost:3000/api/v1/events');
    expect(output).toContain('Petición enviada');
    expect(output).toContain('"cardUid": "A1B2C3D4"');
    expect(output).toContain('Respuesta   HTTP 200');
    expect(output).toContain('Resultado   registered');
    expect(output).toContain('Mensaje     Asistencia registrada');
    expect(output).toContain('Cuerpo completo de la respuesta');
    expect(output).toContain('Ana Gómez');
  });

  it('nunca imprime el secreto de la credencial', async () => {
    const test = harness(successResponse());
    await runCli(['enviar', '--key', KEY, '--uid', UID], test.deps);

    expect(test.stdout()).toContain('vad_LAB-DESARROLLO-01_…(secreto oculto)');
    expect(`${test.stdout()}${test.stderr()}`).not.toContain('s3cr3to');
  });

  it('con --json imprime un único objeto máquina-legible', async () => {
    const test = harness(successResponse());
    const code = await runCli(['enviar', '--key', KEY, '--uid', UID, '--json'], test.deps);

    expect(code).toBe(EXIT_CODES.ok);
    const parsed = JSON.parse(test.stdout()) as {
      command: string;
      endpoint: string;
      outcomes: { status: number }[];
      exitCode: number;
    };
    expect(parsed.command).toBe('enviar');
    expect(parsed.endpoint).toBe('http://localhost:3000/api/v1/events');
    expect(parsed.outcomes).toHaveLength(1);
    expect(parsed.outcomes[0]?.status).toBe(200);
  });
});

describe('runCli — códigos de salida', () => {
  it('0 cuando el result coincide con --expect', async () => {
    const test = harness(successResponse());
    const code = await runCli(
      ['enviar', '--key', KEY, '--uid', UID, '--expect', 'registered'],
      test.deps,
    );
    expect(code).toBe(EXIT_CODES.ok);
  });

  it('2 cuando el result no es el esperado', async () => {
    const test = harness(successResponse({ result: 'no_session' }));
    const code = await runCli(
      ['enviar', '--key', KEY, '--uid', UID, '--expect', 'registered'],
      test.deps,
    );

    expect(code).toBe(EXIT_CODES.unexpectedResult);
    expect(test.stderr()).toContain('no es el esperado');
  });

  it('1 cuando el servidor devuelve un error del contrato', async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ ok: false, error: 'device_revoked', message: 'Dispositivo revocado' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      );
    const test = harness(fetch);
    const code = await runCli(['enviar', '--key', KEY, '--uid', UID], test.deps);

    expect(code).toBe(EXIT_CODES.errorResponse);
    expect(test.stdout()).toContain('Error       device_revoked');
  });

  it('3 cuando el servidor incumple el contrato', async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: 'registered' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const test = harness(fetch);
    const code = await runCli(['enviar', '--key', KEY, '--uid', UID], test.deps);

    expect(code).toBe(EXIT_CODES.contractViolation);
    expect(test.stderr()).toContain('VIOLACIÓN DE CONTRATO');
  });

  it('4 cuando no hay respuesta tras agotar los reintentos', async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    const test = harness(fetch);
    const code = await runCli(
      ['reintentar', '--key', KEY, '--uid', UID, '--backoff', '0'],
      test.deps,
    );

    expect(code).toBe(EXIT_CODES.transport);
    expect(test.stderr()).toContain('SIN RESPUESTA');
    expect(test.bodies).toHaveLength(5);
    expect(new Set(test.bodies.map((body) => body.eventId)).size).toBe(1);
  });

  it('4 cuando la lectura que se iba a enviar no cumple el contrato', async () => {
    const test = harness(successResponse());
    const code = await runCli(['enviar', '--key', KEY, '--uid', 'A1B2C3'], test.deps);

    expect(code).toBe(EXIT_CODES.transport);
    expect(test.stderr()).toContain('cardUid');
    expect(test.bodies).toHaveLength(0);
  });
});

describe('runCli — comandos', () => {
  it('repetir reenvía la misma lectura con el mismo eventId (RN7)', async () => {
    const test = harness(successResponse());
    const code = await runCli(['repetir', '--key', KEY, '--uid', UID, '--count', '4'], test.deps);

    expect(code).toBe(EXIT_CODES.ok);
    expect(test.bodies).toHaveLength(4);
    expect(new Set(test.bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(test.stdout()).toContain('Resumen     4 lectura(s): registered ×4');
  });

  it('rafaga envía lecturas con UID distinto cada una', async () => {
    const test = harness(successResponse());
    const code = await runCli(['rafaga', '--key', KEY, '--count', '3', '--delay', '0'], test.deps);

    expect(code).toBe(EXIT_CODES.ok);
    expect(test.bodies).toHaveLength(3);
    expect(new Set(test.bodies.map((body) => body.cardUid)).size).toBe(3);
    expect(new Set(test.bodies.map((body) => body.eventId)).size).toBe(3);
  });

  it('enrolar envía un UID nuevo y muestra el result', async () => {
    const test = harness(
      successResponse({
        result: 'enrollment_captured',
        message: 'Carnet capturado',
        student: null,
      }),
    );
    const code = await runCli(
      ['enrolar', '--key', KEY, '--expect', 'enrollment_captured'],
      test.deps,
    );

    expect(code).toBe(EXIT_CODES.ok);
    expect(test.bodies[0]?.cardUid).toMatch(/^[0-9A-F]{8}$/);
    expect(test.stdout()).toContain('Resultado   enrollment_captured');
  });

  it('--scanned-at-offset atrasa el reloj del dispositivo sin tocar nada más (RN8)', async () => {
    const test = harness(successResponse());
    const code = await runCli(
      ['enviar', '--key', KEY, '--uid', UID, '--scanned-at-offset', '-3h'],
      test.deps,
    );

    expect(code).toBe(EXIT_CODES.ok);
    const scannedAt = test.bodies[0]?.scannedAt;
    expect(typeof scannedAt).toBe('string');
    const delta = Date.now() - new Date(scannedAt as string).getTime();
    expect(delta).toBeGreaterThan(3 * 3_600_000 - 10_000);
    expect(delta).toBeLessThan(3 * 3_600_000 + 10_000);
  });

  it('--device distinto de la credencial es lo que provoca el 403 device_mismatch', async () => {
    const test = harness(successResponse());
    await runCli(['enviar', '--key', KEY, '--uid', UID, '--device', 'OTRO-LECTOR'], test.deps);

    expect(test.bodies[0]?.deviceId).toBe('OTRO-LECTOR');
  });

  it('muestra la escalera de reintentos cuando hubo más de un intento', async () => {
    let call = 0;
    const success = successResponse();
    const fetch: FetchLike = (url, init) => {
      call += 1;
      if (call < 3) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      return success(url, init);
    };
    const test = harness(fetch);
    const code = await runCli(['enviar', '--key', KEY, '--uid', UID], test.deps);

    expect(code).toBe(EXIT_CODES.ok);
    expect(test.stdout()).toContain('todos con el mismo eventId');
    expect(test.stdout()).toContain('espera 1000 ms antes de reintentar');
    expect(test.stdout()).toContain('espera 2000 ms antes de reintentar');
  });
});
