import { describe, expect, it } from 'vitest';

import { recoveryRedirectUrl, resolveRequestOrigin } from './origin';

function headers(entries: Record<string, string>): { get(name: string): string | null } {
  const map = new Map(Object.entries(entries).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name) => map.get(name.toLowerCase()) ?? null };
}

describe('resolveRequestOrigin', () => {
  it('prefiere NEXT_PUBLIC_SITE_URL sin barra final', () => {
    expect(
      resolveRequestOrigin(
        { NEXT_PUBLIC_SITE_URL: 'https://vision-attendance-web.vercel.app/' },
        headers({ host: 'localhost:3000' }),
      ),
    ).toBe('https://vision-attendance-web.vercel.app');
  });

  it('usa el host reenviado de Vercel cuando no hay SITE_URL', () => {
    expect(
      resolveRequestOrigin(
        {},
        headers({
          'x-forwarded-host': 'vision-attendance-web.vercel.app',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://vision-attendance-web.vercel.app');
  });

  it('asume http en localhost y https en el resto', () => {
    expect(resolveRequestOrigin({}, headers({ host: 'localhost:3000' }))).toBe(
      'http://localhost:3000',
    );
    expect(resolveRequestOrigin({}, headers({ host: 'app.example.edu' }))).toBe(
      'https://app.example.edu',
    );
  });
});

describe('recoveryRedirectUrl', () => {
  it('apunta al callback de Auth con next de nueva contraseña', () => {
    expect(recoveryRedirectUrl('https://vision-attendance-web.vercel.app/')).toBe(
      'https://vision-attendance-web.vercel.app/auth/callback?next=/auth/update-password',
    );
  });
});
