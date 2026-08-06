/**
 * Resolución de `DATABASE_URL` para los procesos que no son Next.js (migraciones, seed, drizzle-kit).
 *
 * `apps/web` no necesita nada de esto: Next.js carga `.env` por su cuenta.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Raíz del repositorio. Funciona igual desde `src/` y desde `dist/`. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Cadena de conexión del PostgreSQL 17 local que levanta `pnpm db:up`.
 * Es la misma forma que expone `supabase start`, para que ambos sean intercambiables.
 */
export const LOCAL_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * Carga `<raíz>/.env` si existe y todavía no hay `DATABASE_URL` en el entorno.
 * En CI la variable llega del entorno del job, así que esto no hace nada.
 */
export function loadRootEnvFile(): void {
  if (process.env['DATABASE_URL']) return;

  const envFile = path.join(REPO_ROOT, '.env');
  if (!existsSync(envFile)) return;

  process.loadEnvFile(envFile);
}

/**
 * Devuelve la cadena de conexión a usar.
 *
 * Orden: variable de entorno → `.env` de la raíz → PostgreSQL local. El respaldo local existe
 * para que `pnpm db:migrate` funcione en un clon recién bajado sin haber copiado `.env`.
 */
export function getDatabaseUrl(): string {
  loadRootEnvFile();
  return process.env['DATABASE_URL'] ?? LOCAL_DATABASE_URL;
}
