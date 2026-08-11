import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock('./current-user', () => ({ getCurrentUser }));
vi.mock('next/navigation', () => ({ redirect }));

import { requireAuthenticatedUser, requireRole } from './guards';

beforeEach(() => {
  getCurrentUser.mockReset();
  redirect.mockClear();
});

describe('guardas de autorización', () => {
  it('envía al login al usuario anónimo', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireAuthenticatedUser()).rejects.toThrow('redirect:/login');
  });

  it('impide que un profesor entre al panel administrativo', async () => {
    getCurrentUser.mockResolvedValue({
      id: 'teacher-id',
      email: 'teacher@example.test',
      fullName: 'Profesora',
      role: 'teacher',
    });
    await expect(requireRole('admin')).rejects.toThrow('redirect:/sessions');
  });

  it('devuelve al administrador activo', async () => {
    const admin = {
      id: 'admin-id',
      email: 'admin@example.test',
      fullName: 'Administradora',
      role: 'admin' as const,
    };
    getCurrentUser.mockResolvedValue(admin);
    await expect(requireRole('admin')).resolves.toEqual(admin);
  });
});
