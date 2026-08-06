/**
 * `pnpm db:migrate` — aplica las migraciones pendientes sobre la base apuntada por `DATABASE_URL`.
 * Idempotente: si no hay nada pendiente, no hace nada.
 */

import process from 'node:process';

import { getDatabaseUrl } from './env.js';
import { migrateToLatest } from './migrations.js';

/** Oculta la contraseña de la cadena de conexión antes de imprimirla. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(cadena de conexión no interpretable)';
  }
}

async function main(): Promise<void> {
  const url = getDatabaseUrl();
  console.log(`→ Aplicando migraciones sobre ${redact(url)}`);

  await migrateToLatest(url);

  console.log('✔ Migraciones aplicadas.');
}

main().catch((error: unknown) => {
  console.error('\n✖ Falló la migración:');
  console.error(error);
  process.exitCode = 1;
});
