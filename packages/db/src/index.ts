/**
 * `@va/db` — esquema Drizzle, migraciones y cliente de PostgreSQL.
 *
 * Solo lo consume código de servidor (`apps/web`). Importa `@va/shared` únicamente como tipos.
 */

export * from './schema.js';
export * from './client.js';
export { LOCAL_DATABASE_URL, getDatabaseUrl, loadRootEnvFile } from './env.js';
export { MIGRATIONS_FOLDER, runMigrations } from './migrations.js';
