/**
 * Pruebas de integración del pipeline de ingesta, contra PostgreSQL real.
 *
 * Cubren la matriz obligatoria de la lane W2 (`docs/agent-playbook.md` §4): contrato, idempotencia,
 * concurrencia, autenticación, carnet desconocido, enrolamiento y normalización de UID.
 */

import { randomUUID } from 'node:crypto';

import { cards, rfidEvents } from '@va/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ingestDeviceEvent } from './ingest';
import { bearer, deviceEventBody, TestWorkspace } from './test-fixtures';

let workspace: TestWorkspace;

beforeAll(() => {
  workspace = TestWorkspace.open();
});

afterAll(async () => {
  await workspace.cleanup();
});

/** Cuenta las filas de `rfid_events` de un dispositivo para un `eventId` concreto. */
async function countEvents(deviceRowId: string, eventId: string): Promise<number> {
  const rows = await workspace.database
    .select({ id: rfidEvents.id })
    .from(rfidEvents)
    .where(and(eq(rfidEvents.deviceId, deviceRowId), eq(rfidEvents.eventId, eventId)));
  return rows.length;
}

/** Todas las filas de `rfid_events` de un dispositivo. */
async function eventsOfDevice(deviceRowId: string) {
  return workspace.database.select().from(rfidEvents).where(eq(rfidEvents.deviceId, deviceRowId));
}

describe('contrato', () => {
  it('procesa la petición del ejemplo de docs/device-contract.md', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const body = deviceEventBody({ deviceId: device.name, cardUid: uid });
    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ok: true,
      eventId: body['eventId'],
      // El motor de sesiones es de la lane W4: hasta entonces todo carnet conocido es `no_session`.
      result: 'no_session',
      receivedAt: expect.any(String),
      message: 'Entrada registrada; no hay clase activa',
      student: { code: student.studentCode, name: student.fullName },
      session: null,
    });
  });

  it('guarda el `scannedAt` del lector como dato informativo y `received_at` como verdad (RN8)', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const serverNow = new Date('2026-08-10T23:41:02.000Z');
    const body = deviceEventBody({
      deviceId: device.name,
      cardUid: uid,
      // Reloj del lector muy desfasado a propósito.
      scannedAt: '2020-01-01T00:00:00-05:00',
    });

    await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
      now: () => serverNow,
    });

    const [row] = await eventsOfDevice(device.id);
    expect(row?.receivedAt).toEqual(serverNow);
    expect(row?.scannedAt).toEqual(new Date('2020-01-01T00:00:00-05:00'));
  });

  it.each([
    ['sin `eventId`', { eventId: undefined }],
    ['con un `eventId` que no es UUID', { eventId: 'no-es-uuid' }],
    ['con un `cardUid` de longitud inválida', { cardUid: 'A1B2C3' }],
    ['con un `cardUid` que no es hexadecimal', { cardUid: 'ZZZZZZZZ' }],
    ['con un `scannedAt` sin zona horaria', { scannedAt: '2026-08-10T13:05:12' }],
  ])('responde 400 invalid_payload a un cuerpo %s', async (_caso, override) => {
    const device = await workspace.createDevice();
    const body = {
      ...deviceEventBody({ deviceId: device.name, cardUid: workspace.nextCardUid() }),
      ...override,
    };

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
    });

    expect(result).toEqual({
      status: 400,
      body: { ok: false, error: 'invalid_payload', message: 'Cuerpo de la solicitud inválido' },
    });
    expect(await eventsOfDevice(device.id)).toHaveLength(0);
  });

  it('responde 400 invalid_payload cuando el cuerpo no llegó a ser JSON', async () => {
    const device = await workspace.createDevice();

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: undefined,
      database: workspace.database,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_payload' });
  });

  it('responde 400 invalid_payload cuando `deviceId` está presente pero vacío', async () => {
    const device = await workspace.createDevice();
    const body = deviceEventBody({
      deviceId: '',
      cardUid: workspace.nextCardUid(),
    });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
    });

    expect(result).toEqual({
      status: 400,
      body: { ok: false, error: 'invalid_payload', message: 'Cuerpo de la solicitud inválido' },
    });
    expect(await eventsOfDevice(device.id)).toHaveLength(0);
  });

  it('responde 400 unsupported_contract (y NO invalid_payload) a `contractVersion: 2`', async () => {
    const device = await workspace.createDevice();
    const body = deviceEventBody({
      deviceId: device.name,
      cardUid: workspace.nextCardUid(),
      contractVersion: 2,
    });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
    });

    expect(result).toEqual({
      status: 400,
      body: {
        ok: false,
        error: 'unsupported_contract',
        message: 'Versión de contrato no soportada',
      },
    });
  });

  it('distingue `unsupported_contract` de `invalid_payload` aunque el resto del cuerpo esté mal', async () => {
    const device = await workspace.createDevice();

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: { contractVersion: 99, deviceId: device.name },
      database: workspace.database,
    });

    expect(result.body).toMatchObject({ error: 'unsupported_contract' });
  });

  it('acepta un lector sin reloj fiable (`scannedAt: null`) y sin versión de firmware', async () => {
    const device = await workspace.createDevice();
    const body = deviceEventBody({
      deviceId: device.name,
      cardUid: workspace.nextCardUid(),
      scannedAt: null,
      firmwareVersion: null,
    });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
    });

    expect(result.status).toBe(200);
    const [row] = await eventsOfDevice(device.id);
    expect(row?.scannedAt).toBeNull();
  });
});

describe('autenticación', () => {
  it('responde 401 sin cabecera Authorization', async () => {
    const result = await ingestDeviceEvent({
      authorization: null,
      body: {},
      database: workspace.database,
    });

    expect(result).toEqual({
      status: 401,
      body: { ok: false, error: 'invalid_credentials', message: 'Credenciales inválidas' },
    });
  });

  it('responde 401 con una credencial bien formada pero inexistente', async () => {
    const result = await ingestDeviceEvent({
      authorization: bearer('vad_FANTASMA-01_0123456789abcdefghijklmnop'),
      body: {},
      database: workspace.database,
    });

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ error: 'invalid_credentials' });
  });

  it('responde 403 device_revoked y NO deja ningún rastro procesado', async () => {
    const device = await workspace.createDevice({ status: 'revoked' });
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
    });

    expect(result).toEqual({
      status: 403,
      body: { ok: false, error: 'device_revoked', message: 'Dispositivo revocado' },
    });
    expect(await eventsOfDevice(device.id)).toHaveLength(0);
  });

  it('responde 403 device_mismatch si el `deviceId` no es el de la credencial', async () => {
    const device = await workspace.createDevice();
    const otro = await workspace.createDevice();

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: otro.name, cardUid: workspace.nextCardUid() }),
      database: workspace.database,
    });

    expect(result).toEqual({
      status: 403,
      body: {
        ok: false,
        error: 'device_mismatch',
        message: 'El deviceId no corresponde a la credencial',
      },
    });
    expect(await eventsOfDevice(device.id)).toHaveLength(0);
    expect(await eventsOfDevice(otro.id)).toHaveLength(0);
  });

  it('comprueba la credencial antes que el cuerpo: sin credencial es 401, no 400', async () => {
    const result = await ingestDeviceEvent({
      authorization: null,
      body: { contractVersion: 7, deviceId: 'CUALQUIERA' },
      database: workspace.database,
    });

    expect(result.status).toBe(401);
  });
});

describe('idempotencia (RN7)', () => {
  it('el mismo `eventId` dos veces da la misma respuesta y una sola fila', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const body = deviceEventBody({ deviceId: device.name, cardUid: uid });

    const first = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
    });
    const second = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
      // Reloj distinto: la respuesta almacenada manda, no la hora del reintento.
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    expect(second.status).toBe(200);
    expect(await countEvents(device.id, String(body['eventId']))).toBe(1);
  });

  it('el mismo `eventId` con otra caja de mayúsculas también colisiona', async () => {
    const device = await workspace.createDevice();
    const uid = workspace.nextCardUid();
    const eventId = randomUUID();

    const first = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid, eventId }),
      database: workspace.database,
    });
    const second = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({
        deviceId: device.name,
        cardUid: uid,
        eventId: eventId.toUpperCase(),
      }),
      database: workspace.database,
    });

    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    expect(await eventsOfDevice(device.id)).toHaveLength(1);
  });

  it('el mismo `eventId` en dos dispositivos distintos son dos eventos distintos', async () => {
    const uno = await workspace.createDevice();
    const otro = await workspace.createDevice();
    const eventId = randomUUID();

    await ingestDeviceEvent({
      authorization: bearer(uno.apiKey),
      body: deviceEventBody({ deviceId: uno.name, cardUid: workspace.nextCardUid(), eventId }),
      database: workspace.database,
    });
    await ingestDeviceEvent({
      authorization: bearer(otro.apiKey),
      body: deviceEventBody({ deviceId: otro.name, cardUid: workspace.nextCardUid(), eventId }),
      database: workspace.database,
    });

    expect(await countEvents(uno.id, eventId)).toBe(1);
    expect(await countEvents(otro.id, eventId)).toBe(1);
  });
});

describe('concurrencia', () => {
  it('dos peticiones simultáneas con el mismo `eventId` dejan una fila y dos respuestas iguales', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const body = deviceEventBody({ deviceId: device.name, cardUid: uid });

    let engineCalls = 0;
    const attendanceEngine = () => {
      engineCalls += 1;
      return Promise.resolve({ result: 'no_session' as const, session: null });
    };

    const [first, second] = await Promise.all([
      ingestDeviceEvent({
        authorization: bearer(device.apiKey),
        body,
        database: workspace.database,
        attendanceEngine,
      }),
      ingestDeviceEvent({
        authorization: bearer(device.apiKey),
        body,
        database: workspace.database,
        attendanceEngine,
      }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    expect(await countEvents(device.id, String(body['eventId']))).toBe(1);
    expect(engineCalls).toBe(1);
  });

  it('un payload competidor con el mismo `eventId` no deja efectos del perdedor', async () => {
    const device = await workspace.createDevice({ mode: 'enrollment' });
    const eventId = randomUUID();
    const firstUid = workspace.nextCardUid();
    const secondUid = workspace.nextCardUid();

    const [first, second] = await Promise.all([
      ingestDeviceEvent({
        authorization: bearer(device.apiKey),
        body: deviceEventBody({ deviceId: device.name, cardUid: firstUid, eventId }),
        database: workspace.database,
      }),
      ingestDeviceEvent({
        authorization: bearer(device.apiKey),
        body: deviceEventBody({ deviceId: device.name, cardUid: secondUid, eventId }),
        database: workspace.database,
      }),
    ]);

    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    expect(await countEvents(device.id, eventId)).toBe(1);

    const captured = await workspace.database
      .select({ uid: cards.uid })
      .from(cards)
      .where(sql`${cards.uid} in (${firstUid}, ${secondUid})`);
    expect(captured).toHaveLength(1);
    expect([firstUid, secondUid]).toContain(captured[0]?.uid);
  });
});

describe('carnet desconocido (modo normal)', () => {
  it('devuelve `unknown_card` y registra la fila igualmente (RN1)', async () => {
    const device = await workspace.createDevice({ mode: 'normal' });
    const uid = workspace.nextCardUid();
    const body = deviceEventBody({ deviceId: device.name, cardUid: uid });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      result: 'unknown_card',
      message: 'Carnet no registrado',
      student: null,
      session: null,
    });

    const rows = await eventsOfDevice(device.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toBe('unknown_card');
    expect(rows[0]?.cardUid).toBe(uid);
    // La respuesta devuelta es exactamente la que quedó almacenada (RN7).
    expect(rows[0]?.response).toEqual(result.body);
  });

  it('un UID capturado y todavía sin estudiante sigue siendo `unknown_card` en modo normal', async () => {
    const device = await workspace.createDevice({ mode: 'normal' });
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid);

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
    });

    // El contrato define `unknown_card` como «carnet no asociado» y la respuesta de `no_session`
    // exige el bloque `student`: sin estudiante no puede haber `no_session`.
    expect(result.body).toMatchObject({ result: 'unknown_card', student: null });
  });

  it('no resuelve un carnet inactivo: el UID vuelve a ser desconocido', async () => {
    const device = await workspace.createDevice({ mode: 'normal' });
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id, status: 'inactive' });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
    });

    expect(result.body).toMatchObject({ result: 'unknown_card' });
  });
});

describe('modo enrolamiento', () => {
  it('captura un UID nuevo: `enrollment_captured` y carnet con student_id NULL', async () => {
    const device = await workspace.createDevice({ mode: 'enrollment' });
    const uid = workspace.nextCardUid();

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
    });

    expect(result.body).toMatchObject({
      ok: true,
      result: 'enrollment_captured',
      message: 'Carnet capturado',
      student: null,
      session: null,
    });

    const created = await workspace.database.select().from(cards).where(eq(cards.uid, uid));
    expect(created).toHaveLength(1);
    expect(created[0]?.studentId).toBeNull();
    expect(created[0]?.status).toBe('active');

    // El evento apunta al carnet que acaba de crear.
    const [event] = await eventsOfDevice(device.id);
    expect(event?.cardId).toBe(created[0]?.id);
  });

  it('repetir la captura del mismo UID no duplica el carnet', async () => {
    const device = await workspace.createDevice({ mode: 'enrollment' });
    const uid = workspace.nextCardUid();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await ingestDeviceEvent({
        authorization: bearer(device.apiKey),
        // `eventId` distinto en cada intento: es una lectura física nueva, no un reintento.
        body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
        database: workspace.database,
      });
      expect(result.body).toMatchObject({ result: 'enrollment_captured' });
    }

    const created = await workspace.database.select().from(cards).where(eq(cards.uid, uid));
    expect(created).toHaveLength(1);
    expect(await eventsOfDevice(device.id)).toHaveLength(3);
  });

  it('un carnet ya asociado a un estudiante no se recaptura: pasa al motor de asistencia', async () => {
    const device = await workspace.createDevice({ mode: 'enrollment' });
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
    });

    expect(result.body).toMatchObject({
      result: 'no_session',
      student: { code: student.studentCode, name: student.fullName },
    });
  });
});

describe('normalización del UID', () => {
  it('el mismo carnet como `a1:b2:c3:d4` y como `A1B2C3D4` resuelve al mismo carnet', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    const card = await workspace.createCard(uid, { studentId: student.id });

    // Misma lectura escrita como la sirve un lector con separadores y en minúsculas.
    const conSeparadoresUid = (uid.match(/../g) ?? []).join(':').toLowerCase();

    const conSeparadores = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: conSeparadoresUid }),
      database: workspace.database,
    });
    const enMayusculas = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
    });

    expect(conSeparadores.body).toMatchObject({
      student: { code: student.studentCode, name: student.fullName },
    });
    expect(enMayusculas.body).toMatchObject({
      student: { code: student.studentCode, name: student.fullName },
    });

    const rows = await eventsOfDevice(device.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.cardUid)).toEqual([uid, uid]);
    expect(rows.every((row) => row.cardId === card.id)).toBe(true);
  });
});

describe('motor de asistencia (punto de conexión de W4)', () => {
  it('usa el resultado y la sesión que devuelve el motor inyectado', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const sessionId = randomUUID();
    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
      attendanceEngine: () =>
        Promise.resolve({
          result: 'registered',
          session: { id: sessionId, scheduledStart: '2026-08-10T23:00:00.000Z' },
        }),
    });

    expect(result.body).toMatchObject({
      result: 'registered',
      message: 'Asistencia registrada',
      session: { id: sessionId, scheduledStart: '2026-08-10T23:00:00.000Z' },
    });
  });

  it('ejecuta `persist` solo después de insertar la fila del evento', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    let eventRowExistedWhenPersisting = false;
    let reservedId = '';

    await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
      attendanceEngine: (context) => {
        reservedId = context.eventRowId;
        return Promise.resolve({
          result: 'registered',
          session: null,
          persist: async (persistTx) => {
            const rows = await persistTx
              .select({ id: rfidEvents.id })
              .from(rfidEvents)
              .where(eq(rfidEvents.id, context.eventRowId));
            eventRowExistedWhenPersisting = rows.length === 1;
          },
        });
      },
    });

    expect(eventRowExistedWhenPersisting).toBe(true);

    const [event] = await eventsOfDevice(device.id);
    expect(event?.id).toBe(reservedId);
  });

  it('un motor que falla no pierde la hora de entrada: el evento queda con `result` error', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
      attendanceEngine: () => Promise.reject(new Error('el motor de W4 explotó')),
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      result: 'error',
      message: 'Error interno; la lectura quedó registrada',
    });

    const rows = await eventsOfDevice(device.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toBe('error');
  });

  it('un error SQL real del motor revierte su SAVEPOINT pero conserva `rfid_events` (RN1)', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
      attendanceEngine: async (context) => {
        await context.tx.execute(sql`select 1 / 0`);
        return { result: 'registered', session: null };
      },
    });

    expect(result).toMatchObject({
      status: 200,
      body: { result: 'error', message: 'Error interno; la lectura quedó registrada' },
    });

    const rows = await eventsOfDevice(device.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ result: 'error', response: result.body });
  });

  it('aísla un `persist` fallido y conserva el evento con la respuesta final `error`', async () => {
    const device = await workspace.createDevice();
    const student = await workspace.createStudent();
    const uid = workspace.nextCardUid();
    const rolledBackUid = workspace.nextCardUid();
    await workspace.createCard(uid, { studentId: student.id });
    const body = deviceEventBody({ deviceId: device.name, cardUid: uid });

    const result = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
      attendanceEngine: () =>
        Promise.resolve({
          result: 'registered',
          session: null,
          persist: async (persistTx) => {
            await persistTx.insert(cards).values({ uid: rolledBackUid, status: 'active' });
            await persistTx.execute(sql`select 1 / 0`);
          },
        }),
    });

    expect(result).toMatchObject({
      status: 200,
      body: { result: 'error', message: 'Error interno; la lectura quedó registrada' },
    });

    const rows = await eventsOfDevice(device.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ result: 'error', response: result.body });
    expect(
      await workspace.database.select().from(cards).where(eq(cards.uid, rolledBackUid)),
    ).toHaveLength(0);

    const replay = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body,
      database: workspace.database,
      attendanceEngine: () => {
        throw new Error('Un replay no debe volver a ejecutar el motor.');
      },
    });
    expect(JSON.stringify(replay.body)).toBe(JSON.stringify(result.body));
    expect(await countEvents(device.id, String(body['eventId']))).toBe(1);
  });
});

describe('última conexión del dispositivo', () => {
  it('actualiza `last_seen_at` y `firmware_version`', async () => {
    const device = await workspace.createDevice();
    const seenAt = new Date('2026-08-10T18:05:13.000Z');

    await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({
        deviceId: device.name,
        cardUid: workspace.nextCardUid(),
        firmwareVersion: '1.4.2',
      }),
      database: workspace.database,
      now: () => seenAt,
    });

    const [row] = await workspace.database
      .select()
      .from(rfidEvents)
      .where(eq(rfidEvents.deviceId, device.id));
    expect(row).toBeDefined();

    const stored = await workspace.database.query.devices.findFirst({
      where: (table, operators) => operators.eq(table.id, device.id),
    });
    expect(stored?.lastSeenAt).toEqual(seenAt);
    expect(stored?.firmwareVersion).toBe('1.4.2');
  });
});
