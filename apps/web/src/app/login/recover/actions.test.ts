import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const getRequestOrigin = vi.hoisted(() => vi.fn());

vi.mock('@/app/_lib/supabase/server', () => ({ createSupabaseServerClient }));
vi.mock('@/app/_lib/supabase/origin', () => ({
  getRequestOrigin,
  recoveryRedirectUrl: (origin: string) =>
    `${origin.replace(/\/$/, '')}/auth/callback?next=/auth/update-password`,
}));

import { recoverAction } from './actions';
import { RECOVER_IDLE } from './form-state';

function emailForm(email: string) {
  const formData = new FormData();
  formData.set('email', email);
  return formData;
}

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  getRequestOrigin.mockReset();
  getRequestOrigin.mockResolvedValue('https://vision-attendance-web.vercel.app');
});

describe('recoverAction', () => {
  it('valida el correo antes de llamar a Auth', async () => {
    const result = await recoverAction(RECOVER_IDLE, emailForm('no-es-correo'));
    expect(result.status).toBe('error');
    expect(result.fieldErrors.email).toBeDefined();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('pide el enlace con redirectTo de producción y no revela si el correo existe', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ auth: { resetPasswordForEmail } });

    const result = await recoverAction(RECOVER_IDLE, emailForm('camilo@example.test'));

    expect(resetPasswordForEmail).toHaveBeenCalledWith('camilo@example.test', {
      redirectTo:
        'https://vision-attendance-web.vercel.app/auth/callback?next=/auth/update-password',
    });
    expect(result.status).toBe('success');
    expect(result.message).toMatch(/enlace/i);
  });
});
