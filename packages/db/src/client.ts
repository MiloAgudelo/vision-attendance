/**
 * Cliente de base de datos: Drizzle sobre postgres.js.
 *
 * Todo el acceso a datos ocurre en el servidor con la conexión directa de `DATABASE_URL`
 * (`docs/architecture.md` §4.3). El navegador nunca lee datos: todas las tablas tienen RLS
 * activado en modo deny-all.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { getDatabaseUrl } from './env.js';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>;

export interface CreateDatabaseOptions {
  /** Cadena de conexión. Por defecto, la resuelta por {@link getDatabaseUrl}. */
  url?: string;
  /** Tamaño máximo del pool. Los procesos de un solo uso (migrar, sembrar) usan 1. */
  max?: number;
}

/** Crea una conexión nueva. El llamador es responsable de cerrarla con {@link closeDatabase}. */
export function createDatabase(options: CreateDatabaseOptions = {}) {
  const client = postgres(options.url ?? getDatabaseUrl(), {
    max: options.max ?? 10,
    // Supabase expone un pooler en modo transacción, incompatible con sentencias preparadas.
    prepare: false,
    onnotice: () => {},
  });

  return drizzle(client, { schema });
}

/** Cierra la conexión subyacente de una instancia creada con {@link createDatabase}. */
export async function closeDatabase(database: Database): Promise<void> {
  await database.$client.end({ timeout: 5 });
}

let cached: Database | undefined;

/**
 * Instancia compartida por el proceso, creada de forma perezosa.
 *
 * Perezosa a propósito: importar `@va/db` durante el build de Next.js no debe abrir conexiones
 * ni exigir que `DATABASE_URL` esté definida.
 */
export function getDatabase(): Database {
  cached ??= createDatabase();
  return cached;
}
