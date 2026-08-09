/**
 * Códigos de salida de la CLI.
 *
 * El simulador se usa en pruebas automáticas, así que el código de salida es parte de su contrato:
 * 0 solo cuando la respuesta es la esperada.
 */
export const EXIT_CODES = {
  /** Respuesta procesada y, si se pidió `--expect`, con el `result` esperado. */
  ok: 0,
  /** El servidor respondió un error del contrato (`ok: false`). */
  errorResponse: 1,
  /** La respuesta fue válida pero su `result` no es el que se esperaba (`--expect`). */
  unexpectedResult: 2,
  /** El servidor respondió algo que no cumple el contrato v1. */
  contractViolation: 3,
  /** No hubo respuesta tras agotar los reintentos, o la lectura era inválida. */
  transport: 4,
  /** Argumentos mal usados (convención `sysexits.h`: EX_USAGE). */
  usage: 64,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
