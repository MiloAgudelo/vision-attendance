/**
 * Pruebas del route handler: solo la capa de transporte.
 *
 * El pipeline se prueba sin HTTP en `src/server/events/ingest.test.ts`; aquí se comprueba que la
 * ruta traslada el código y el cuerpo, que un JSON roto no revienta y que un fallo inesperado se
 * traduce a `internal_error`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ingestDeviceEvent = vi.hoisted(() => vi.fn());

vi.mock('@/server/events/ingest', () => ({ ingestDeviceEvent }));

const { POST } = await import('./route.js');

beforeEach(() => {
  ingestDeviceEvent.mockReset();
});

function peticion(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /api/v1/events', () => {
  it('devuelve el código y el cuerpo que decide el pipeline', async () => {
    const cuerpo = {
      ok: true,
      eventId: '5f3a2c9e-8d41-4b7a-9c1e-2a6f8e4d0b73',
      result: 'no_session',
      receivedAt: '2026-08-10T23:41:02.000Z',
      message: 'Entrada registrada; no hay clase activa',
      student: { code: '202410123', name: 'Nombre Apellido' },
      session: null,
    };
    ingestDeviceEvent.mockResolvedValue({ status: 200, body: cuerpo });

    const response = await POST(
      peticion(JSON.stringify({ contractVersion: 1 }), { authorization: 'Bearer vad_X_y' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(cuerpo);
    expect(ingestDeviceEvent).toHaveBeenCalledWith({
      authorization: 'Bearer vad_X_y',
      body: { contractVersion: 1 },
    });
  });

  it('propaga los códigos de error del contrato', async () => {
    ingestDeviceEvent.mockResolvedValue({
      status: 403,
      body: { ok: false, error: 'device_revoked', message: 'Dispositivo revocado' },
    });

    const response = await POST(peticion('{}'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'device_revoked' });
  });

  it('con un cuerpo que no es JSON llama al pipeline con `undefined`, para que la credencial se compruebe primero', async () => {
    ingestDeviceEvent.mockResolvedValue({
      status: 401,
      body: { ok: false, error: 'invalid_credentials', message: 'Credenciales inválidas' },
    });

    const response = await POST(peticion('esto no es json'));

    expect(ingestDeviceEvent).toHaveBeenCalledWith({ authorization: null, body: undefined });
    expect(response.status).toBe(401);
  });

  it('traduce un fallo inesperado a 500 internal_error', async () => {
    ingestDeviceEvent.mockRejectedValue(new Error('la base se cayó'));

    const response = await POST(peticion('{}'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'internal_error',
      message: 'Error interno',
    });
  });
});
