'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { findActiveApplicationUser } from '@/app/_lib/auth/current-user';
import { createSupabaseServerClient } from '@/app/_lib/supabase/server';

import type { UpdatePasswordState } from './form-state';

const updatePasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirm: z.string().min(1, 'Confirma la contraseña.'),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirm'],
  });

export async function updatePasswordAction(
  _previous: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      status: 'error',
      message: 'El enlace no es válido o ya venció. Solicita uno nuevo.',
      fieldErrors: {},
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: {},
    };
  }

  const applicationUser = await findActiveApplicationUser(user.id);
  redirect(applicationUser?.role === 'admin' ? '/admin' : '/sessions');
}
