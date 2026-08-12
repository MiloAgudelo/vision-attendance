import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const findActiveApplicationUser = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock('@/app/_lib/supabase/server', () => ({ createSupabaseServerClient }));
vi.mock('@/app/_lib/auth/current-user', () => ({ findActiveApplicationUser }));
vi.mock('next/navigation', () => ({ redirect }));

import { updatePasswordAction } from './actions';
import { UPDATE_PASSWORD_IDLE } from './form-state';

function passwordForm(password: string, confirm = password) {
  const formData = new FormData();
  formData.set('password', password);
  formData.set('confirm', confirm);
  return formData;
}

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  findActiveApplicationUser.mockReset();
  redirect.mockClear();
});

describe('updatePasswordAction', () => {
  it('exige coincidencia y longitud mínima', async () => {
    const mismatch = await updatePasswordAction(
      UPDATE_PASSWORD_IDLE,
      passwordForm('secreto1', 'otra'),
    );
    expect(mismatch.status).toBe('error');
    expect(mismatch.fieldErrors.confirm).toBeDefined();

    const short = await updatePasswordAction(UPDATE_PASSWORD_IDLE, passwordForm('corta'));
    expect(short.fieldErrors.password).toBeDefined();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('guarda la contraseña y redirige según el rol', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null }),
        updateUser,
      },
    });
    findActiveApplicationUser.mockResolvedValue({ role: 'admin' });

    await expect(
      updatePasswordAction(UPDATE_PASSWORD_IDLE, passwordForm('NuevaClave9')),
    ).rejects.toThrow('redirect:/admin');
    expect(updateUser).toHaveBeenCalledWith({ password: 'NuevaClave9' });
  });

  it('avisa si el enlace de recuperación ya no tiene sesión', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        updateUser: vi.fn(),
      },
    });

    const result = await updatePasswordAction(
      UPDATE_PASSWORD_IDLE,
      passwordForm('NuevaClave9'),
    );
    expect(result.status).toBe('error');
    expect(result.message).toMatch(/venció/i);
  });
});
