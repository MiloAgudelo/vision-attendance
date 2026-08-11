import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const findActiveApplicationUser = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock('../_lib/supabase/server', () => ({ createSupabaseServerClient }));
vi.mock('../_lib/auth/current-user', () => ({ findActiveApplicationUser }));
vi.mock('next/navigation', () => ({ redirect }));

import { loginAction } from './actions';
import { LOGIN_IDLE } from './form-state';

function credentials(email = 'persona@example.test', password = 'secreto') {
  const formData = new FormData();
  formData.set('email', email);
  formData.set('password', password);
  return formData;
}

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  findActiveApplicationUser.mockReset();
  redirect.mockClear();
});

describe('loginAction', () => {
  it('valida los campos antes de consultar Auth', async () => {
    const result = await loginAction(LOGIN_IDLE, credentials('correo-invalido', ''));
    expect(result.status).toBe('error');
    expect(result.fieldErrors.email).toBeDefined();
    expect(result.fieldErrors.password).toBeDefined();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('redirige al espacio del rol resuelto en public.users', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: 'teacher-id' } },
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({
      auth: { signInWithPassword, signOut: vi.fn() },
    });
    findActiveApplicationUser.mockResolvedValue({
      id: 'teacher-id',
      email: 'teacher@example.test',
      fullName: 'Profesora',
      role: 'teacher',
    });

    await expect(loginAction(LOGIN_IDLE, credentials())).rejects.toThrow('redirect:/sessions');
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'persona@example.test',
      password: 'secreto',
    });
  });

  it('cierra la sesión Auth si la cuenta local no está activa', async () => {
    const signOut = vi.fn();
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: 'auth-id' } },
          error: null,
        }),
        signOut,
      },
    });
    findActiveApplicationUser.mockResolvedValue(null);

    const result = await loginAction(LOGIN_IDLE, credentials());
    expect(result).toMatchObject({ status: 'error' });
    expect(result.message).toContain('no está habilitada');
    expect(signOut).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });
});
