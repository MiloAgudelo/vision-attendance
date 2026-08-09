import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkHealth = vi.hoisted(() => vi.fn());

vi.mock('@/server/health', () => ({ checkHealth }));

const { GET } = await import('./route.js');

beforeEach(() => {
  checkHealth.mockReset();
});

describe('GET /api/health', () => {
  it('responde 200 con ok:true y db:"up" cuando la base contesta', async () => {
    checkHealth.mockResolvedValue({ ok: true, db: 'up' });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, db: 'up' });
  });

  it('responde 503 con ok:false y db:"down" cuando la base no contesta', async () => {
    checkHealth.mockResolvedValue({ ok: false, db: 'down' });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, db: 'down' });
  });
});
