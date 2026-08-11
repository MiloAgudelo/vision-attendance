'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { findActiveApplicationUser } from '../_lib/auth/current-user';
import { createSupabaseServerClient } from '../_lib/supabase/server';

import type { LoginState } from './form-state';

const loginSchema = z.object({
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Revisa los campos indicados.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      status: 'error',
      message: 'El inicio de sesión no está configurado. Comunícate con el administrador.',
      fieldErrors: {},
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return {
      status: 'error',
      message: 'El correo o la contraseña no son correctos.',
      fieldErrors: {},
    };
  }

  const applicationUser = await findActiveApplicationUser(data.user.id);
  if (!applicationUser) {
    await supabase.auth.signOut();
    return {
      status: 'error',
      message: 'Tu cuenta no está habilitada para usar este sistema.',
      fieldErrors: {},
    };
  }

  redirect(applicationUser.role === 'admin' ? '/admin' : '/sessions');
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect('/login');
}
