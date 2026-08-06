import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  ATTENDANCE_SOURCES,
  CARD_STATUSES,
  CORRECTION_ACTIONS,
  DEVICE_MODES,
  DEVICE_STATUSES,
  EVENT_RESULTS,
  RECORD_STATUSES,
  USER_ROLES,
} from '@va/shared';
import { getTableName, is, Table } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER } from './migrations.js';
import * as schema from './schema.js';
import { TABLE_NAMES } from './schema.js';

/** SQL de todas las migraciones concatenado, en el orden en que se aplican. */
function readAllMigrations(): string {
  const files = readdirSync(MIGRATIONS_FOLDER)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return files.map((file) => readFileSync(path.join(MIGRATIONS_FOLDER, file), 'utf8')).join('\n');
}

/** Tablas realmente declaradas en `schema.ts`, leídas de los objetos de Drizzle. */
function declaredTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter((value): value is Table => is(value, Table))
    .map((table) => getTableName(table))
    .sort();
}

describe('inventario de tablas', () => {
  it('TABLE_NAMES coincide exactamente con las tablas declaradas en el esquema', () => {
    expect(declaredTableNames()).toEqual([...TABLE_NAMES].sort());
  });

  it('cubre las 12 tablas del MVP', () => {
    expect(TABLE_NAMES).toHaveLength(12);
  });
});

describe('migraciones', () => {
  const sql = readAllMigrations();

  it('crea todas las tablas del esquema', () => {
    for (const table of TABLE_NAMES) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('activa RLS deny-all en TODAS las tablas', () => {
    for (const table of TABLE_NAMES) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('no declara ninguna policy: deny-all significa exactamente eso', () => {
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
  });

  it('crea los índices críticos del modelo de datos', () => {
    // Un UID solo puede estar activo en un carnet a la vez (índice parcial).
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "cards_uid_active_unique" ON "cards" USING btree \("uid"\) WHERE .*'active'/,
    );
    // Idempotencia de la creación perezosa de sesiones (RN3).
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "class_sessions_group_date_start_unique" ON "class_sessions" USING btree ("group_id","session_date","scheduled_start")',
    );
    // Idempotencia del contrato del dispositivo (RN7).
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "rfid_events_device_event_unique" ON "rfid_events" USING btree ("device_id","event_id")',
    );
    expect(sql).toContain(
      'CREATE INDEX "rfid_events_card_uid_received_at_idx" ON "rfid_events" USING btree ("card_uid","received_at")',
    );
    expect(sql).toContain(
      'CREATE INDEX "rfid_events_received_at_idx" ON "rfid_events" USING btree ("received_at")',
    );
    // Una sola asistencia por (sesión, estudiante) (RN6).
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "attendances_session_student_unique" ON "attendances" USING btree ("session_id","student_id")',
    );
  });

  it('crea los CHECK del horario semanal', () => {
    expect(sql).toContain('"schedules"."weekday" between 1 and 7');
    expect(sql).toContain('"schedules"."end_time" > "schedules"."start_time"');
  });
});

describe('enums', () => {
  const cases: Array<[string, readonly string[], readonly string[]]> = [
    ['user_role', schema.userRole.enumValues, USER_ROLES],
    ['record_status', schema.recordStatus.enumValues, RECORD_STATUSES],
    ['card_status', schema.cardStatus.enumValues, CARD_STATUSES],
    ['device_mode', schema.deviceMode.enumValues, DEVICE_MODES],
    ['device_status', schema.deviceStatus.enumValues, DEVICE_STATUSES],
    ['event_result', schema.eventResult.enumValues, EVENT_RESULTS],
    ['attendance_source', schema.attendanceSource.enumValues, ATTENDANCE_SOURCES],
    ['correction_action', schema.correctionAction.enumValues, CORRECTION_ACTIONS],
  ];

  it.each(cases)(
    '%s tiene los mismos valores y orden que @va/shared',
    (_name, dbValues, shared) => {
      expect(dbValues).toEqual([...shared]);
    },
  );

  it.each(cases)('%s se crea en la migración inicial', (name, dbValues) => {
    const sql = readAllMigrations();
    const values = dbValues.map((value) => `'${value}'`).join(', ');
    expect(sql).toContain(`CREATE TYPE "public"."${name}" AS ENUM(${values})`);
  });
});
