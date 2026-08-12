import { describe, expect, it } from 'vitest';

import {
  createDefaultEventRateLimiter,
  createSlidingWindowRateLimiter,
} from './rate-limit';

describe('createSlidingWindowRateLimiter', () => {
  it('permite hasta `limit` solicitudes y luego bloquea dentro de la ventana', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 2, windowMs: 1_000 });
    const t0 = 1_000_000;

    expect(limiter.allow('dev-a', t0)).toBe(true);
    expect(limiter.allow('dev-a', t0 + 10)).toBe(true);
    expect(limiter.allow('dev-a', t0 + 20)).toBe(false);
  });

  it('aísla las claves entre sí', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 1, windowMs: 1_000 });
    const t0 = 2_000_000;

    expect(limiter.allow('a', t0)).toBe(true);
    expect(limiter.allow('b', t0)).toBe(true);
    expect(limiter.allow('a', t0 + 1)).toBe(false);
  });

  it('libera cupos cuando los golpes salen de la ventana', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 1, windowMs: 100 });
    const t0 = 3_000_000;

    expect(limiter.allow('dev', t0)).toBe(true);
    expect(limiter.allow('dev', t0 + 50)).toBe(false);
    expect(limiter.allow('dev', t0 + 101)).toBe(true);
  });

  it('con limit ≤ 0 no bloquea nunca', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 0, windowMs: 1_000 });
    expect(limiter.allow('dev', 1)).toBe(true);
    expect(limiter.allow('dev', 2)).toBe(true);
  });

  it('reset() vacía el historial', () => {
    const limiter = createSlidingWindowRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.allow('dev', 10)).toBe(true);
    expect(limiter.allow('dev', 11)).toBe(false);
    limiter.reset();
    expect(limiter.allow('dev', 12)).toBe(true);
  });
});

describe('createDefaultEventRateLimiter', () => {
  it('lee el cupo y la ventana desde el entorno', () => {
    const limiter = createDefaultEventRateLimiter({
      EVENTS_RATE_LIMIT: '1',
      EVENTS_RATE_LIMIT_WINDOW_MS: '60000',
    });
    expect(limiter.allow('x', 0)).toBe(true);
    expect(limiter.allow('x', 1)).toBe(false);
  });

  it('EVENTS_RATE_LIMIT=0 desactiva el límite', () => {
    const limiter = createDefaultEventRateLimiter({ EVENTS_RATE_LIMIT: '0' });
    expect(limiter.allow('z', 0)).toBe(true);
    expect(limiter.allow('z', 1)).toBe(true);
  });
});
