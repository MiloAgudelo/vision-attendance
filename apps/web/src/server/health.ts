/**
 * Comprobación de salud del servicio.
 *
 * Vive en `src/server/` y no depende de Next: se puede probar sin HTTP
 * (`docs/architecture.md` §3).
 */

import { getDatabase, type Database } from '@va/db';
import { sql } from 'drizzle-orm';

export interface HealthStatus {
  ok: boolean;
  db: 'up' | 'down';
}

/** Parte de `@va/db` que necesita esta comprobación: poder ejecutar una consulta trivial. */
export type HealthProbe = Pick<Database, 'execute'>;

/**
 * Ejecuta un `select 1` contra la base.
 *
 * No lanza: traduce cualquier fallo de conexión a `{ ok: false, db: 'down' }` para que el
 * endpoint pueda responder 503 en vez de un error sin forma.
 */
export async function checkHealth(database?: HealthProbe): Promise<HealthStatus> {
  try {
    const probe = database ?? getDatabase();
    await probe.execute(sql`select 1`);
    return { ok: true, db: 'up' };
  } catch (error) {
    console.error('[health] la base de datos no respondió:', error);
    return { ok: false, db: 'down' };
  }
}
