/** Pruebas de integración del CRUD de dispositivos, contra PostgreSQL real. */

import { devices } from '@va/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TestWorkspace } from '../events/test-fixtures';
import { hashDeviceApiKey } from './credentials';
import {
  createDevice,
  findDeviceByApiKey,
  listDevices,
  recordDeviceContact,
  revokeDevice,
  setDeviceMode,
} from './devices';
import { BusinessRuleError } from './errors';

let workspace: TestWorkspace;

beforeAll(() => {
  workspace = TestWorkspace.open();
});

afterAll(async () => {
  await workspace.cleanup();
});

/** Da de alta un dispositivo por el camino real y lo apunta para su limpieza. */
async function altaDeDispositivo(room: string | null = null) {
  const name = `W2-${workspace.prefix}-alta-${Math.random().toString(36).slice(2, 8)}`;
  const created = await createDevice({ name, room }, { database: workspace.database });
  workspace.trackDevice(created.device.id);
  return created;
}

describe('createDevice', () => {
  it('devuelve la credencial en claro UNA vez y guarda solo su SHA-256', async () => {
    const { device, apiKey } = await altaDeDispositivo('Bloque A - 301');

    expect(apiKey.startsWith(`vad_${device.name}_`)).toBe(true);
    expect(device).toMatchObject({ mode: 'normal', status: 'active', room: 'Bloque A - 301' });

    const [stored] = await workspace.database
      .select()
      .from(devices)
      .where(eq(devices.id, device.id));

    expect(stored?.apiKeyHash).toBe(hashDeviceApiKey(apiKey));
    // La key en claro no aparece por ninguna parte de la fila.
    expect(JSON.stringify(stored)).not.toContain(apiKey);

    // Y el listado, que es lo que ve la interfaz, tampoco expone el hash.
    const listado = await listDevices({ database: workspace.database });
    const enLista = listado.find((row) => row.id === device.id);
    expect(enLista).toBeDefined();
    expect(Object.keys(enLista ?? {})).not.toContain('apiKeyHash');
  });

  it('convierte el salón vacío en NULL', async () => {
    const { device } = await altaDeDispositivo('');
    expect(device.room).toBeNull();
  });

  it('rechaza un nombre repetido con un error de negocio, no con un 500', async () => {
    const { device } = await altaDeDispositivo();

    await expect(
      createDevice({ name: device.name, room: null }, { database: workspace.database }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it.each([
    ['con guion bajo', 'LAB_DESARROLLO'],
    ['con espacios', 'Lector de laboratorio'],
    ['con acentos', 'LECTOR-ÁLGEBRA'],
    ['vacío', ''],
  ])('rechaza un nombre %s: no cabría en la credencial', async (_caso, name) => {
    await expect(
      createDevice({ name, room: null }, { database: workspace.database }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe('revokeDevice y setDeviceMode', () => {
  it('revoca el dispositivo', async () => {
    const { device } = await altaDeDispositivo();

    const revocado = await revokeDevice(device.id, { database: workspace.database });
    expect(revocado.status).toBe('revoked');
  });

  it('cambia el modo entre normal y enrolamiento', async () => {
    const { device } = await altaDeDispositivo();

    const enEnrolamiento = await setDeviceMode(device.id, 'enrollment', {
      database: workspace.database,
    });
    expect(enEnrolamiento.mode).toBe('enrollment');

    const enNormal = await setDeviceMode(device.id, 'normal', { database: workspace.database });
    expect(enNormal.mode).toBe('normal');
  });

  it('avisa en español cuando el dispositivo ya no existe', async () => {
    await expect(
      revokeDevice('00000000-0000-4000-8000-000000000000', { database: workspace.database }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rechaza un identificador que no es un uuid', async () => {
    await expect(
      setDeviceMode('no-es-uuid', 'normal', { database: workspace.database }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe('findDeviceByApiKey', () => {
  it('resuelve el dispositivo por el hash de la credencial', async () => {
    const { device, apiKey } = await altaDeDispositivo();

    const encontrado = await findDeviceByApiKey(apiKey, { database: workspace.database });
    expect(encontrado).toMatchObject({ id: device.id, name: device.name, status: 'active' });
  });

  it('devuelve null si la credencial no corresponde a ningún dispositivo', async () => {
    const encontrado = await findDeviceByApiKey('vad_FANTASMA-01_0123456789abcdefghij', {
      database: workspace.database,
    });
    expect(encontrado).toBeNull();
  });

  it('devuelve también los revocados, para poder distinguir 401 de 403', async () => {
    const { device, apiKey } = await altaDeDispositivo();
    await revokeDevice(device.id, { database: workspace.database });

    const encontrado = await findDeviceByApiKey(apiKey, { database: workspace.database });
    expect(encontrado?.status).toBe('revoked');
  });
});

describe('recordDeviceContact', () => {
  it('no borra la versión de firmware conocida cuando el lector no la informa', async () => {
    const { device } = await altaDeDispositivo();
    const database = workspace.database;

    await recordDeviceContact(
      device.id,
      { seenAt: new Date(), firmwareVersion: '2.0.0' },
      { database },
    );
    await recordDeviceContact(
      device.id,
      { seenAt: new Date(), firmwareVersion: null },
      { database },
    );

    const [stored] = await database.select().from(devices).where(eq(devices.id, device.id));
    expect(stored?.firmwareVersion).toBe('2.0.0');
  });
});
