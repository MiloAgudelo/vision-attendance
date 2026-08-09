#!/usr/bin/env node
/**
 * PostgreSQL 17 local para desarrollo, SIN Docker y SIN privilegios de administrador.
 *
 * Resuelve los binarios reales de PostgreSQL que publica `@embedded-postgres/<plataforma>`
 * y los maneja con `pg_ctl`, que arranca el servidor como proceso independiente: sobrevive
 * al fin de este proceso de Node (la API de Node de `embedded-postgres` lo dejaría colgando
 * de un proceso hijo que muere al salir).
 *
 * El puerto, el usuario y la base son los mismos que usa `supabase start`, de modo que el día
 * que el CLI de Supabase esté disponible sea intercambiable sin tocar una línea de código.
 *
 *   node scripts/pg.mjs up      inicializa (si hace falta) y arranca el servidor
 *   node scripts/pg.mjs down    detiene el servidor
 *   node scripts/pg.mjs status  informa si el servidor está corriendo
 *   node scripts/pg.mjs reset   detiene, borra el directorio de datos y vuelve a arrancar
 */

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** Debe coincidir con DATABASE_URL de `.env.example` y con `src/env.ts`. */
export const PG_PORT = 54322;
export const PG_USER = 'postgres';
export const PG_PASSWORD = 'postgres';
export const PG_DATABASE = 'postgres';

const DATA_DIR = path.join(REPO_ROOT, '.pgdata');
const LOG_FILE = path.join(DATA_DIR, 'postgres.log');
const START_LOG_FILE = path.join(DATA_DIR, 'pg_ctl.log');

/** Paquete de binarios que corresponde a esta plataforma. */
const PLATFORM_PACKAGES = {
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
  'linux-arm64': '@embedded-postgres/linux-arm64',
  'linux-x64': '@embedded-postgres/linux-x64',
  'win32-x64': '@embedded-postgres/windows-x64',
};

async function resolveBinaries() {
  const key = `${process.platform}-${process.arch}`;
  const packageName = PLATFORM_PACKAGES[key];

  if (!packageName) {
    fail(
      `No hay binarios de PostgreSQL embebido para esta plataforma (${key}).\n` +
        'Alternativas: instalar PostgreSQL 17 manualmente o usar `supabase start`, y exportar ' +
        'DATABASE_URL apuntando a esa instancia.',
    );
  }

  try {
    /** @type {{ initdb: string, pg_ctl: string, postgres: string }} */
    const binaries = await import(packageName);
    return binaries;
  } catch {
    return fail(
      `No se pudo cargar ${packageName}.\n` +
        'Ejecuta `pnpm install` y comprueba que pnpm tiene permitido correr el postinstall del ' +
        'paquete (campo `allowBuilds` de pnpm-workspace.yaml): sin ese postinstall los binarios ' +
        'quedan sin hidratar.',
    );
  }
}

/** Ejecuta un binario mostrando su salida; devuelve el resultado sin abortar. */
function run(binary, args, options = {}) {
  return spawnSync(binary, args, {
    stdio: options.quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    ...options,
  });
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** ¿Hay un servidor corriendo sobre este directorio de datos? */
function isRunning(pgCtl) {
  if (!existsSync(DATA_DIR)) return false;
  // `pg_ctl status` devuelve 0 si está corriendo, 3 si está detenido, 4 si el directorio no sirve.
  const result = run(pgCtl, ['-D', DATA_DIR, 'status'], { quiet: true });
  return result.status === 0;
}

function initialize(initdb) {
  console.log(`→ Inicializando el directorio de datos en ${DATA_DIR}`);

  const passwordDir = mkdtempSync(path.join(tmpdir(), 'va-pg-'));
  const passwordFile = path.join(passwordDir, 'pwfile');
  writeFileSync(passwordFile, PG_PASSWORD, 'utf8');

  try {
    const result = run(initdb, [
      '--pgdata',
      DATA_DIR,
      '--username',
      PG_USER,
      '--pwfile',
      passwordFile,
      '--auth',
      'scram-sha-256',
      '--encoding',
      'UTF8',
      '--locale',
      'C',
    ]);

    if (result.status !== 0) {
      fail('`initdb` falló. Revisa la salida anterior.');
    }
  } finally {
    rmSync(passwordDir, { recursive: true, force: true });
  }
}

function start(pgCtl) {
  console.log(`→ Arrancando PostgreSQL 17 en 127.0.0.1:${PG_PORT}`);

  const serverOptions = [
    `-p ${PG_PORT}`,
    '-c listen_addresses=127.0.0.1',
    '-c timezone=UTC',
    '-c log_timezone=UTC',
  ].join(' ');

  // El servidor que arranca `pg_ctl` hereda los descriptores de este proceso y sigue vivo
  // después de que Node termine: si le pasáramos tuberías (`inherit`/`pipe`), la terminal que
  // invocó `pnpm db:up` se quedaría colgada esperando un EOF que no llega nunca. Por eso la
  // salida va a un archivo real, que además queda para diagnóstico.
  const startLogFd = openSync(START_LOG_FILE, 'w');
  let result;
  try {
    result = run(
      pgCtl,
      ['-D', DATA_DIR, '-l', LOG_FILE, '-o', serverOptions, '-w', '-t', '60', 'start'],
      { stdio: ['ignore', startLogFd, startLogFd] },
    );
  } finally {
    closeSync(startLogFd);
  }

  if (result.status !== 0) {
    printTail(START_LOG_FILE, 'pg_ctl.log');
    printTail(LOG_FILE, 'postgres.log');
    fail('`pg_ctl start` falló. ¿Hay otro servidor ocupando el puerto?');
  }
}

function printTail(file, label) {
  if (!existsSync(file)) return;
  console.error(`\n--- últimas líneas de ${label} ---`);
  console.error(readFileSync(file, 'utf8').split('\n').slice(-25).join('\n'));
}

function stop(pgCtl, { silent = false } = {}) {
  if (!isRunning(pgCtl)) {
    if (!silent) console.log('→ El servidor local ya estaba detenido.');
    return;
  }

  console.log('→ Deteniendo PostgreSQL local');
  const result = run(pgCtl, ['-D', DATA_DIR, '-m', 'fast', '-w', '-t', '60', 'stop']);
  if (result.status !== 0) {
    fail('`pg_ctl stop` falló. Revisa la salida anterior.');
  }
}

const CONNECTION_URL = `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DATABASE}`;

/** Comprueba de verdad que el servidor acepta conexiones (no hay `pg_isready` en el paquete). */
async function waitUntilReady() {
  const { default: postgres } = await import('postgres');

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const sql = postgres(CONNECTION_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });
    try {
      await sql`select 1`;
      await sql.end({ timeout: 5 });
      return;
    } catch (error) {
      await sql.end({ timeout: 5 }).catch(() => {});
      if (attempt === 30) {
        fail(`El servidor arrancó pero no acepta conexiones: ${String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function commandUp({ initdb, pg_ctl: pgCtl }) {
  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    initialize(initdb);
  }

  if (isRunning(pgCtl)) {
    console.log('→ El servidor local ya estaba corriendo.');
  } else {
    start(pgCtl);
  }

  await waitUntilReady();
  console.log(`✔ PostgreSQL listo en ${CONNECTION_URL}`);
}

async function commandDown({ pg_ctl: pgCtl }) {
  stop(pgCtl);
  console.log('✔ PostgreSQL local detenido.');
}

async function commandStatus({ pg_ctl: pgCtl }) {
  if (isRunning(pgCtl)) {
    console.log(`✔ PostgreSQL local corriendo en ${CONNECTION_URL}`);
  } else {
    console.log('· PostgreSQL local detenido.');
  }
}

async function commandReset(binaries) {
  stop(binaries.pg_ctl, { silent: true });
  console.log(`→ Borrando el directorio de datos ${DATA_DIR}`);
  rmSync(DATA_DIR, { recursive: true, force: true });
  await commandUp(binaries);
}

const COMMANDS = {
  up: commandUp,
  down: commandDown,
  status: commandStatus,
  reset: commandReset,
};

async function main() {
  const command = process.argv[2] ?? 'up';
  const handler = COMMANDS[command];

  if (!handler) {
    fail(`Comando desconocido: ${command}. Usa uno de: ${Object.keys(COMMANDS).join(', ')}.`);
  }

  const binaries = await resolveBinaries();
  await handler(binaries);
}

await main();
