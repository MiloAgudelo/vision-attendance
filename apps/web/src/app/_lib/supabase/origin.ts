import { headers } from 'next/headers';

type HeaderReader = { get(name: string): string | null };

/**
 * Origen público de la app para `redirectTo` de Auth (recuperación de contraseña).
 *
 * Orden: `NEXT_PUBLIC_SITE_URL` → cabeceras del request → localhost. En Vercel las cabeceras
 * `x-forwarded-*` coinciden con el host del deploy (producción o preview).
 */
export function resolveRequestOrigin(
  environment: Record<string, string | undefined>,
  headerMap: HeaderReader,
): string {
  const configured = environment['NEXT_PUBLIC_SITE_URL']?.trim().replace(/\/$/, '');
  if (configured) return configured;

  const host = headerMap.get('x-forwarded-host') ?? headerMap.get('host');
  if (!host) return 'http://localhost:3000';

  const proto =
    headerMap.get('x-forwarded-proto') ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function getRequestOrigin(): Promise<string> {
  return resolveRequestOrigin(process.env, await headers());
}

export function recoveryRedirectUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/auth/callback?next=/auth/update-password`;
}
