import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkHealth, type HealthProbe } from './health.js';

/** Doble de `@va/db` que solo sabe ejecutar la consulta de sondeo. */
function probe(behaviour: 'ok' | 'fail'): HealthProbe {
  return {
    execute: vi.fn(async () => {
      if (behaviour === 'fail') throw new Error('connection refused');
      return [{ '?column?': 1 }];
    }),
  } as unknown as HealthProbe;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkHealth', () => {
  it('reporta la base arriba cuando la consulta de sondeo responde', async () => {
    const database = probe('ok');

    await expect(checkHealth(database)).resolves.toEqual({ ok: true, db: 'up' });
    expect(database.execute).toHaveBeenCalledTimes(1);
  });

  it('reporta la base abajo, sin lanzar, cuando la consulta falla', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(checkHealth(probe('fail'))).resolves.toEqual({ ok: false, db: 'down' });
  });

  it('deja rastro en el log cuando la base no responde', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await checkHealth(probe('fail'));

    expect(logged).toHaveBeenCalledOnce();
  });
});
