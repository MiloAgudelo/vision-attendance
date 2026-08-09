/**
 * Tipos compartidos del pipeline de ingesta.
 *
 * Reexporta lo que los módulos del pipeline necesitan de `@va/db` y `@va/shared` para que cada
 * archivo declare una sola procedencia y el tipo de la transacción se escriba una única vez.
 */

import type { Database as DatabaseConnection } from '@va/db';

export type { DeviceEventSession, DeviceMode, EventResult } from '@va/shared';

/** Transacción de Drizzle: la misma superficie de consulta que la conexión. */
export type Transaction = Parameters<Parameters<DatabaseConnection['transaction']>[0]>[0];

/**
 * Conexión o transacción: el pipeline consulta indistintamente por una u otra.
 *
 * Cualquier función que reciba esto puede participar dentro de la transacción del evento.
 */
export type Database = DatabaseConnection | Transaction;
