/**
 * Errores de negocio del subsistema de dispositivos y enrolamiento.
 *
 * Un `BusinessRuleError` es una situación **esperada** (nombre duplicado, carnet ya asignado…) que
 * la interfaz muestra como un mensaje en español, nunca como un 500.
 */

/** Regla de negocio incumplida. `message` está en español y es apto para mostrarse tal cual. */
export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

/** Código SQLSTATE de violación de restricción única en PostgreSQL. */
const UNIQUE_VIOLATION = '23505';

/** Profundidad máxima de la cadena `cause` que se recorre buscando el error de PostgreSQL. */
const MAX_CAUSE_DEPTH = 5;

/**
 * ¿El error viene de una restricción única de PostgreSQL?
 *
 * Sirve para convertir una carrera perdida (dos altas simultáneas del mismo nombre, dos
 * asignaciones del mismo UID) en un `BusinessRuleError` en vez de en un 500. Si se indica
 * `constraint`, además comprueba de qué índice se trata.
 *
 * Recorre la cadena `cause` porque Drizzle envuelve el error de postgres.js en un
 * `DrizzleQueryError`: el SQLSTATE está un nivel más abajo.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let candidate: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof candidate !== 'object' || candidate === null) return false;

    const {
      code,
      constraint_name: constraintName,
      cause,
    } = candidate as {
      code?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };

    if (code === UNIQUE_VIOLATION) {
      return constraint === undefined || constraintName === constraint;
    }

    candidate = cause;
  }

  return false;
}
