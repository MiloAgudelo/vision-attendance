import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireRole = vi.hoisted(() => vi.fn());

vi.mock('@/app/_lib/auth/guards', () => ({ requireRole }));

import { runFormAction } from './form-action';

beforeEach(() => {
  requireRole.mockReset();
});

describe('runFormAction', () => {
  it('no ejecuta una mutación administrativa sin autorización', async () => {
    const run = vi.fn();
    requireRole.mockRejectedValue(new Error('redirect:/sessions'));

    await expect(runFormAction(run)).rejects.toThrow('redirect:/sessions');
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(run).not.toHaveBeenCalled();
  });
});
