import { describe, expect, it, vi } from 'vitest';

import { completeAuthCallback, hasAuthCallbackPayload } from './complete-callback';

describe('completeAuthCallback', () => {
  it('intercambia el code PKCE y respeta next interno', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    const result = await completeAuthCallback(
      {
        auth: {
          exchangeCodeForSession,
          verifyOtp: vi.fn(),
          setSession: vi.fn(),
          getSession: vi.fn(),
        },
      },
      'https://app.example/auth/callback?code=abc&next=/auth/update-password',
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(result).toEqual({ ok: true, next: '/auth/update-password' });
  });

  it('verifica token_hash de recuperación', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    const result = await completeAuthCallback(
      {
        auth: {
          exchangeCodeForSession: vi.fn(),
          verifyOtp,
          setSession: vi.fn(),
          getSession: vi.fn(),
        },
      },
      'https://app.example/auth/callback?token_hash=hash&type=recovery',
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'hash' });
    expect(result).toEqual({ ok: true, next: '/auth/update-password' });
  });

  it('guarda la sesión implícita del hash de recuperación', async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const result = await completeAuthCallback(
      {
        auth: {
          exchangeCodeForSession: vi.fn(),
          verifyOtp: vi.fn(),
          setSession,
          getSession: vi.fn(),
        },
      },
      'https://app.example/login#access_token=aaa&expires_in=3600&refresh_token=rrr&type=recovery',
    );

    expect(setSession).toHaveBeenCalledWith({ access_token: 'aaa', refresh_token: 'rrr' });
    expect(result).toEqual({ ok: true, next: '/auth/update-password' });
  });

  it('rechaza next abierto a otro origen', async () => {
    const result = await completeAuthCallback(
      {
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
          verifyOtp: vi.fn(),
          setSession: vi.fn(),
          getSession: vi.fn(),
        },
      },
      'https://app.example/auth/callback?code=abc&next=https://evil.example',
    );

    expect(result).toEqual({ ok: true, next: '/auth/update-password' });
  });
});

describe('hasAuthCallbackPayload', () => {
  it('detecta el hash de recuperación que llega a /login', () => {
    expect(
      hasAuthCallbackPayload(
        'https://app.example/login#access_token=aaa&refresh_token=rrr&type=recovery',
      ),
    ).toBe(true);
    expect(hasAuthCallbackPayload('https://app.example/login')).toBe(false);
  });
});
