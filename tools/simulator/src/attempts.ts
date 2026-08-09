/**
 * Bitácora de intentos de una misma lectura.
 *
 * El contrato (RN7) exige que los reintentos de una lectura reutilicen el MISMO `eventId`; para
 * poder demostrarlo, el cliente devuelve el detalle de cada intento y no solo el resultado final.
 */

/** Por qué hubo que reintentar (o por qué se abandonó) un intento. */
export type AttemptOutcome =
  /** Hubo respuesta HTTP definitiva (aunque el resultado de negocio sea negativo). */
  | 'ok'
  /** El servidor no respondió dentro del tiempo límite. */
  | 'timeout'
  /** Fallo de red: conexión rechazada, DNS, socket cerrado. */
  | 'network'
  /** Respondió con un código que el contrato marca como reintentable (429, 5xx). */
  | 'retryable-status';

export interface SendAttempt {
  /** Número de intento, empezando en 1. */
  readonly attempt: number;
  /** Instante de inicio del intento, ISO-8601 en UTC. */
  readonly startedAt: string;
  /** Duración del intento en milisegundos. */
  readonly durationMs: number;
  /** Código HTTP recibido, o `null` si no hubo respuesta. */
  readonly status: number | null;
  readonly outcome: AttemptOutcome;
  /** Explicación en español cuando el intento no fue definitivo. */
  readonly detail: string | null;
  /** Espera aplicada ANTES del siguiente intento, en milisegundos. */
  readonly backoffMs: number | null;
}

/** ¿El código HTTP justifica un reintento con el mismo `eventId`? (`docs/device-contract.md`) */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Espera antes del intento `attempt + 1`: backoff exponencial 1 s, 2 s, 4 s, 8 s…
 * (`initialMs` por defecto 1000, tal y como manda el contrato).
 */
export function backoffForAttempt(attempt: number, initialMs: number): number {
  return initialMs * 2 ** (attempt - 1);
}
