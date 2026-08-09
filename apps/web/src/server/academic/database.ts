/**
 * Acceso a datos del dominio académico.
 *
 * Los componentes de React NUNCA usan Drizzle: solo llaman a funciones de `src/server/`
 * (`docs/architecture.md` §6). Cada función acepta una conexión explícita para poder probarla
 * contra una base de pruebas sin depender del singleton del proceso.
 */

import { getDatabase, type Database } from '@va/db';

export type AcademicDatabase = Database;

/** Devuelve la conexión recibida o la compartida por el proceso, creada de forma perezosa. */
export function resolveDatabase(database?: AcademicDatabase): AcademicDatabase {
  return database ?? getDatabase();
}
