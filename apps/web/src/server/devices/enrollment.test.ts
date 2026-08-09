/** Pruebas de integración del enrolamiento en la web, contra PostgreSQL real. */

import { cards } from '@va/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BusinessRuleError } from '../devices/errors';
import { ingestDeviceEvent } from '../events/ingest';
import { bearer, deviceEventBody, TestWorkspace } from '../events/test-fixtures';
import { assignCardToStudent, listPendingCards, listRecentCaptures } from './enrollment';

let workspace: TestWorkspace;

beforeAll(() => {
  workspace = TestWorkspace.open();
});

afterAll(async () => {
  await workspace.cleanup();
});

/** Escanea un UID con un lector en modo enrolamiento, como haría el dispositivo real. */
async function capturar(uid: string) {
  const device = await workspace.createDevice({ mode: 'enrollment' });
  const result = await ingestDeviceEvent({
    authorization: bearer(device.apiKey),
    body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
    database: workspace.database,
  });
  expect(result.body).toMatchObject({ result: 'enrollment_captured' });
  return device;
}

describe('listPendingCards y listRecentCaptures', () => {
  it('muestra el UID capturado y su lectura', async () => {
    const uid = workspace.nextCardUid();
    const device = await capturar(uid);

    const pendientes = await listPendingCards({ database: workspace.database });
    expect(pendientes.map((card) => card.uid)).toContain(uid);

    const capturas = await listRecentCaptures(50, { database: workspace.database });
    const propia = capturas.find((captura) => captura.cardUid === uid);
    expect(propia?.deviceName).toBe(device.name);
  });

  it('deja de mostrar el carnet cuando ya tiene estudiante', async () => {
    const uid = workspace.nextCardUid();
    await capturar(uid);
    const student = await workspace.createStudent();

    const [pendiente] = (await listPendingCards({ database: workspace.database })).filter(
      (card) => card.uid === uid,
    );
    expect(pendiente).toBeDefined();

    await assignCardToStudent(
      { cardId: pendiente!.id, studentId: student.id },
      { database: workspace.database },
    );

    const despues = await listPendingCards({ database: workspace.database });
    expect(despues.map((card) => card.uid)).not.toContain(uid);
  });
});

describe('assignCardToStudent', () => {
  it('asocia el UID capturado al estudiante y deja el carnet activo con su fecha', async () => {
    const uid = workspace.nextCardUid();
    await capturar(uid);
    const student = await workspace.createStudent();

    const [pendiente] = await workspace.database.select().from(cards).where(eq(cards.uid, uid));

    const asignado = await assignCardToStudent(
      { cardId: pendiente!.id, studentId: student.id },
      { database: workspace.database },
    );

    expect(asignado).toMatchObject({
      uid,
      studentId: student.id,
      studentCode: student.studentCode,
      studentName: student.fullName,
    });

    const [stored] = await workspace.database
      .select()
      .from(cards)
      .where(eq(cards.id, pendiente!.id));
    expect(stored?.studentId).toBe(student.id);
    expect(stored?.status).toBe('active');
    expect(stored?.assignedAt).toBeInstanceOf(Date);
  });

  it('a partir de la asociación el mismo UID ya no es `unknown_card`', async () => {
    const uid = workspace.nextCardUid();
    await capturar(uid);
    const student = await workspace.createStudent();
    const [pendiente] = await workspace.database.select().from(cards).where(eq(cards.uid, uid));

    await assignCardToStudent(
      { cardId: pendiente!.id, studentId: student.id },
      { database: workspace.database },
    );

    const lector = await workspace.createDevice({ mode: 'normal' });
    const result = await ingestDeviceEvent({
      authorization: bearer(lector.apiKey),
      body: deviceEventBody({ deviceId: lector.name, cardUid: uid }),
      database: workspace.database,
    });

    expect(result.body).toMatchObject({
      result: 'no_session',
      student: { code: student.studentCode, name: student.fullName },
    });
  });

  it('rechaza en español un carnet que ya está asignado', async () => {
    const uid = workspace.nextCardUid();
    await capturar(uid);
    const primero = await workspace.createStudent();
    const segundo = await workspace.createStudent();
    const [pendiente] = await workspace.database.select().from(cards).where(eq(cards.uid, uid));

    await assignCardToStudent(
      { cardId: pendiente!.id, studentId: primero.id },
      { database: workspace.database },
    );

    await expect(
      assignCardToStudent(
        { cardId: pendiente!.id, studentId: segundo.id },
        { database: workspace.database },
      ),
    ).rejects.toThrow(/ya está asignado/);
  });

  it('rechaza en español un UID que ya está activo en otro carnet', async () => {
    const uid = workspace.nextCardUid();
    const titular = await workspace.createStudent();
    const nuevo = await workspace.createStudent();

    // El UID ya vive en un carnet activo asignado…
    await workspace.createCard(uid, { studentId: titular.id });
    // …y además existe una captura antigua del mismo UID que quedó desactivada.
    const capturaVieja = await workspace.createCard(uid, { status: 'inactive' });

    await expect(
      assignCardToStudent(
        { cardId: capturaVieja.id, studentId: nuevo.id },
        { database: workspace.database },
      ),
    ).rejects.toThrow(/ya está activo en otro carnet/);
  });

  it('rechaza un estudiante inexistente y un carnet inexistente', async () => {
    const uid = workspace.nextCardUid();
    await capturar(uid);
    const [pendiente] = await workspace.database.select().from(cards).where(eq(cards.uid, uid));

    await expect(
      assignCardToStudent(
        { cardId: pendiente!.id, studentId: '00000000-0000-4000-8000-000000000000' },
        { database: workspace.database },
      ),
    ).rejects.toThrow(BusinessRuleError);

    const student = await workspace.createStudent();
    await expect(
      assignCardToStudent(
        { cardId: '00000000-0000-4000-8000-000000000000', studentId: student.id },
        { database: workspace.database },
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rechaza identificadores que no son uuid', async () => {
    await expect(
      assignCardToStudent({ cardId: 'x', studentId: 'y' }, { database: workspace.database }),
    ).rejects.toThrow(BusinessRuleError);
  });
});
