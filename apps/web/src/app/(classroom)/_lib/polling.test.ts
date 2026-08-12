import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startLivePolling } from './polling';

describe('startLivePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('actualiza la vista sin recarga manual dentro de 3–5 segundos', () => {
    const refresh = vi.fn();
    const stop = startLivePolling(refresh, 4000);

    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4000);
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(8000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('acota el intervalo al rango operativo de 3–5 s', () => {
    const refresh = vi.fn();
    const stop = startLivePolling(refresh, 1000);
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });
});
