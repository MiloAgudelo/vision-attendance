import type { EmailOtpType } from '@supabase/supabase-js';

export const DEFAULT_RECOVERY_NEXT = '/auth/update-password';

export interface AuthCallbackClient {
  auth: {
    exchangeCodeForSession: (
      code: string,
    ) => Promise<{ error: { message: string } | null }>;
    verifyOtp: (args: {
      type: EmailOtpType;
      token_hash: string;
    }) => Promise<{ error: { message: string } | null }>;
    setSession: (tokens: {
      access_token: string;
      refresh_token: string;
    }) => Promise<{ error: { message: string } | null }>;
    getSession: () => Promise<{
      data: { session: object | null };
      error: { message: string } | null;
    }>;
  };
}

export type AuthCallbackResult =
  | { ok: true; next: string }
  | { ok: false; message: string };

const OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

function otpType(value: string | null): EmailOtpType | null {
  if (!value || !OTP_TYPES.has(value as EmailOtpType)) return null;
  return value as EmailOtpType;
}

/** El correo de recuperación de Supabase llega como `/login#access_token=…&type=recovery`. */
export function hasAuthCallbackPayload(href: string): boolean {
  const url = new URL(href);
  if (url.searchParams.has('code') || url.searchParams.has('token_hash')) return true;
  const hash = url.hash.replace(/^#/, '');
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return Boolean(params.get('access_token') || params.get('type') === 'recovery');
}

function sessionFromHash(href: string): { access_token: string; refresh_token: string } | null {
  const hash = new URL(href).hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * Completa el retorno de un enlace de Auth (PKCE `code`, OTP `token_hash` o tokens en el hash).
 */
export async function completeAuthCallback(
  client: AuthCallbackClient,
  href: string,
): Promise<AuthCallbackResult> {
  const url = new URL(href);
  const next = url.searchParams.get('next')?.startsWith('/')
    ? url.searchParams.get('next')!
    : DEFAULT_RECOVERY_NEXT;

  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: error.message };
    return { ok: true, next };
  }

  const tokenHash = url.searchParams.get('token_hash');
  const type = otpType(url.searchParams.get('type'));
  if (tokenHash && type) {
    const { error } = await client.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return { ok: false, message: error.message };
    return { ok: true, next };
  }

  const tokens = sessionFromHash(href);
  if (tokens) {
    const { error } = await client.auth.setSession(tokens);
    if (error) return { ok: false, message: error.message };
    return { ok: true, next };
  }

  const { data, error } = await client.auth.getSession();
  if (error) return { ok: false, message: error.message };
  if (!data.session) {
    return { ok: false, message: 'El enlace no es válido o ya venció.' };
  }
  return { ok: true, next };
}
