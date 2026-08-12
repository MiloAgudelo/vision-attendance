/**
 * Revisión de seguridad W6: RLS deny-all en vivo, higiene de secretos y rate-limit del contrato.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TABLE_NAMES, rfidEvents } from '@va/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ingestDeviceEvent } from '@/server/events/ingest';
import { createSlidingWindowRateLimiter } from '@/server/events/rate-limit';
import { bearer, deviceEventBody, TestWorkspace } from '@/server/events/test-fixtures';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let workspace: TestWorkspace;

beforeAll(() => {
  workspace = TestWorkspace.open();
});

afterAll(async () => {
  await workspace.cleanup();
});

describe('RLS deny-all', () => {
  it('tiene row security activado en todas las tablas del MVP', async () => {
    const rows = await workspace.database.$client<Array<{ name: string }>>`
      select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity = true
      order by c.relname
    `;

    expect(rows.map((row) => row.name)).toEqual([...TABLE_NAMES].sort());
  });

  it('oculta e impide escribir filas a un rol sin BYPASSRLS aunque tenga GRANT', async () => {
    await workspace.database.execute(sql`
      do $$
      begin
        create role va_rls_probe nologin;
      exception
        when duplicate_object then null;
      end
      $$
    `);
    await workspace.database.execute(sql`grant usage on schema public to va_rls_probe`);
    await workspace.database.execute(
      sql`grant select, insert on all tables in schema public to va_rls_probe`,
    );

    const student = await workspace.createStudent();

    const visibleAsOwner = await workspace.database.$client<Array<{ n: number }>>`
      select count(*)::int as n from students where id = ${student.id}::uuid
    `;
    expect(visibleAsOwner[0]?.n).toBe(1);

    const visibleAsProbe = await workspace.database.$client.begin(async (tx) => {
      await tx`set local role va_rls_probe`;
      return tx<{ n: number }[]>`select count(*)::int as n from students where id = ${student.id}::uuid`;
    });
    expect(visibleAsProbe[0]?.n).toBe(0);

    await expect(
      workspace.database.$client.begin(async (tx) => {
        await tx`set local role va_rls_probe`;
        return tx`
          insert into students (id, student_code, full_name)
          values (gen_random_uuid(), 'rls-probe', 'Probe RLS')
        `;
      }),
    ).rejects.toThrow(/row-level security|policy/i);
  });
});

describe('secretos', () => {
  it('mantiene `.env` y `firmware/**/secrets.h` fuera del control de versiones', () => {
    const gitignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^firmware\/\*\*\/secrets\.h$/m);
  });

  it('no publica la service-role key en variables NEXT_PUBLIC_*', () => {
    const example = readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
    expect(example).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=/m);
    expect(example).not.toMatch(/NEXT_PUBLIC_.*SERVICE_ROLE/);
  });
});

describe('rate-limit del endpoint de eventos', () => {
  it('devuelve 429 rate_limited y no registra el evento rechazado', async () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 });
    const device = await workspace.createDevice();
    const uid = workspace.nextCardUid();

    const ok = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
      rateLimiter: limiter,
      now: () => new Date(5_000),
    });
    expect(ok.status).toBe(200);

    const limited = await ingestDeviceEvent({
      authorization: bearer(device.apiKey),
      body: deviceEventBody({ deviceId: device.name, cardUid: uid }),
      database: workspace.database,
      rateLimiter: limiter,
      now: () => new Date(5_010),
    });
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ ok: false, error: 'rate_limited' });

    const rows = await workspace.database
      .select({ id: rfidEvents.id })
      .from(rfidEvents)
      .where(eq(rfidEvents.deviceId, device.id));
    expect(rows).toHaveLength(1);
  });
});
