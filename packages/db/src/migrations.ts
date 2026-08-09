/**
 * Runner de migraciones. Aplica las migraciones SQL versionadas de `migrations/` en orden y
 * registra las ya aplicadas en `drizzle.__drizzle_migrations`; volver a ejecutarlo es inocuo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabase, closeDatabase, type Database } from './client.js';

/** Carpeta con las migraciones SQL. Igual desde `src/` y desde `dist/`. */
export const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

/** Aplica las migraciones pendientes sobre una conexión existente. */
export async function runMigrations(database: Database): Promise<void> {
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** Abre una conexión de un solo uso, migra y cierra. */
export async function migrateToLatest(url?: string): Promise<void> {
  const database = createDatabase({ max: 1, ...(url === undefined ? {} : { url }) });
  try {
    await runMigrations(database);
  } finally {
    await closeDatabase(database);
  }
}
