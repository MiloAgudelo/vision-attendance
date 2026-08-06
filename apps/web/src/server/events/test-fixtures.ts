/**
 * Utilidades para las pruebas de integración de la lane W2, que corren contra PostgreSQL de verdad.
 *
 * No es código de aplicación: solo lo importan los `*.test.ts`. Dos reglas para poder convivir con
 * las pruebas de las demás lanes en la misma base de CI:
 *
 * 1. **Nada de `truncate`**: cada banco de pruebas genera nombres, códigos y UIDs propios.
 * 2. **Todo lo creado se borra** en {@link TestWorkspace.cleanup}, en orden de claves foráneas.
 */

import { randomBytes, randomUUID } from 'node:crypto';

import {
  cards,
  closeDatabase,
  createDatabase,
  devices,
  getDatabaseUrl,
  rfidEvents,
  students,
  type Database,
} from '@va/db';
import { normalizeCardUid } from '@va/shared';
import { inArray } from 'drizzle-orm';

import { issueDeviceApiKey } from '../devices/credentials';

export interface TestDevice {
  id: string;
  name: string;
  /** Credencial en claro: solo existe aquí, para poder firmar peticiones en las pruebas. */
  apiKey: string;
}

export interface TestStudent {
  id: string;
  studentCode: string;
  fullName: string;
}

export interface TestCard {
  id: string;
  uid: string;
}

/**
 * Banco de pruebas aislado: una conexión propia y un prefijo único por suite.
 *
 * La conexión es propia (y no `getDatabase()`) porque la prueba de concurrencia necesita dos
 * transacciones simultáneas de verdad.
 */
export class TestWorkspace {
  readonly database: Database;
  readonly prefix: string;

  private readonly deviceIds: string[] = [];
  private readonly studentIds: string[] = [];
  private readonly uids: string[] = [];

  private constructor(database: Database, prefix: string) {
    this.database = database;
    this.prefix = prefix;
  }

  static open(): TestWorkspace {
    return new TestWorkspace(
      createDatabase({ url: getDatabaseUrl(), max: 5 }),
      randomUUID().replaceAll('-', '').slice(0, 10),
    );
  }

  /** UID hexadecimal de 4 bytes, único dentro de la ejecución y registrado para su limpieza. */
  nextCardUid(): string {
    const uid = normalizeCardUid(randomBytes(4).toString('hex'));
    this.uids.push(uid);
    return uid;
  }

  async createDevice(
    options: { mode?: 'normal' | 'enrollment'; status?: 'active' | 'revoked'; room?: string } = {},
  ): Promise<TestDevice> {
    const name = `W2-${this.prefix}-${this.deviceIds.length + 1}`;
    const { apiKey, apiKeyHash } = issueDeviceApiKey(name);

    const [device] = await this.database
      .insert(devices)
      .values({
        name,
        apiKeyHash,
        mode: options.mode ?? 'normal',
        status: options.status ?? 'active',
        room: options.room ?? null,
      })
      .returning({ id: devices.id, name: devices.name });

    if (!device) throw new Error('No se pudo crear el dispositivo de prueba.');
    this.deviceIds.push(device.id);
    return { id: device.id, name: device.name, apiKey };
  }

  /** Registra un dispositivo creado por el código de aplicación para que también se limpie. */
  trackDevice(deviceId: string): void {
    this.deviceIds.push(deviceId);
  }

  async createStudent(): Promise<TestStudent> {
    const studentCode = `W2${this.prefix}${this.studentIds.length + 1}`;
    const fullName = `Estudiante de prueba ${this.studentIds.length + 1}`;

    const [student] = await this.database
      .insert(students)
      .values({ studentCode, fullName })
      .returning({ id: students.id });

    if (!student) throw new Error('No se pudo crear el estudiante de prueba.');
    this.studentIds.push(student.id);
    return { id: student.id, studentCode, fullName };
  }

  async createCard(
    uid: string,
    options: { studentId?: string; status?: 'active' | 'inactive' } = {},
  ): Promise<TestCard> {
    if (!this.uids.includes(uid)) this.uids.push(uid);

    const [card] = await this.database
      .insert(cards)
      .values({
        uid,
        studentId: options.studentId ?? null,
        status: options.status ?? 'active',
        assignedAt: options.studentId ? new Date() : null,
      })
      .returning({ id: cards.id, uid: cards.uid });

    if (!card) throw new Error('No se pudo crear el carnet de prueba.');
    return card;
  }

  /** Borra todo lo creado por la suite, en orden de claves foráneas, y cierra la conexión. */
  async cleanup(): Promise<void> {
    try {
      if (this.deviceIds.length > 0) {
        await this.database.delete(rfidEvents).where(inArray(rfidEvents.deviceId, this.deviceIds));
      }
      if (this.uids.length > 0) {
        await this.database.delete(cards).where(inArray(cards.uid, this.uids));
      }
      if (this.studentIds.length > 0) {
        await this.database.delete(students).where(inArray(students.id, this.studentIds));
      }
      if (this.deviceIds.length > 0) {
        await this.database.delete(devices).where(inArray(devices.id, this.deviceIds));
      }
    } finally {
      await closeDatabase(this.database);
    }
  }
}

/** Cuerpo válido del contrato v1, con los valores del ejemplo de `docs/device-contract.md`. */
export function deviceEventBody(overrides: {
  deviceId: string;
  cardUid: string;
  eventId?: string;
  scannedAt?: string | null;
  firmwareVersion?: string | null;
  contractVersion?: number;
}): Record<string, unknown> {
  return {
    contractVersion: overrides.contractVersion ?? 1,
    deviceId: overrides.deviceId,
    eventId: overrides.eventId ?? randomUUID(),
    cardUid: overrides.cardUid,
    scannedAt:
      overrides.scannedAt === undefined ? '2026-08-10T13:05:12-05:00' : overrides.scannedAt,
    firmwareVersion: overrides.firmwareVersion === undefined ? '0.1.0' : overrides.firmwareVersion,
  };
}

/** Cabecera `Authorization` del contrato para una credencial dada. */
export function bearer(apiKey: string): string {
  return `Bearer ${apiKey}`;
}
