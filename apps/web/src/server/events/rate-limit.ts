/**
 * Rate-limit básico en memoria para `POST /api/v1/events`.
 *
 * Ventana deslizante por clave (normalmente el `device.id` autenticado). Suficiente para el piloto
 * de un dispositivo: no hay Redis ni persistencia entre procesos. Desactivar con
 * `EVENTS_RATE_LIMIT=0`.
 */

export interface EventRateLimiter {
  /** Consume un cupo. `false` = demasiadas solicitudes en la ventana. */
  allow(key: string, atMs?: number): boolean;
  reset(): void;
}

export interface SlidingWindowRateLimiterOptions {
  /** Máximo de solicitudes permitidas por clave en la ventana. `≤ 0` desactiva el límite. */
  limit: number;
  /** Anchura de la ventana en milisegundos. */
  windowMs: number;
}

/** Crea un limitador de ventana deslizante (timestamps en memoria). */
export function createSlidingWindowRateLimiter(
  options: SlidingWindowRateLimiterOptions,
): EventRateLimiter {
  const hits = new Map<string, number[]>();

  return {
    allow(key, atMs = Date.now()) {
      if (options.limit <= 0) return true;
      if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) return true;

      const windowStart = atMs - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(atMs);
      hits.set(key, recent);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Limitador por defecto leído de `EVENTS_RATE_LIMIT` / `EVENTS_RATE_LIMIT_WINDOW_MS`. */
export function createDefaultEventRateLimiter(
  environment: Record<string, string | undefined> = process.env,
): EventRateLimiter {
  return createSlidingWindowRateLimiter({
    limit: readPositiveInt(environment['EVENTS_RATE_LIMIT'], 120),
    windowMs: readPositiveInt(environment['EVENTS_RATE_LIMIT_WINDOW_MS'], 60_000),
  });
}

let sharedLimiter: EventRateLimiter | null = null;

/** Instancia compartida del proceso (una por worker de Next). */
export function getEventRateLimiter(): EventRateLimiter {
  if (!sharedLimiter) sharedLimiter = createDefaultEventRateLimiter();
  return sharedLimiter;
}

/** Sustituye el limitador compartido (solo pruebas). Pasa `null` para recrearlo al próximo uso. */
export function setEventRateLimiterForTests(limiter: EventRateLimiter | null): void {
  sharedLimiter = limiter;
}
