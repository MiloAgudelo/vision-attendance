'use server';

import { z } from 'zod';

import { getRequestOrigin, recoveryRedirectUrl } from '@/app/_lib/supabase/origin';
import { createSupabaseServerClient } from '@/app/_lib/supabase/server';

import type { RecoverState } from './form-state';

const recoverSchema = z.object({
  email: z.email('Escribe un correo válido.'),
});

const SENT_MESSAGE =
  'Si el correo está registrado, te enviamos un enlace. Revisa la bandeja de entrada y el spam.';

export async function recoverAction(
  _previous: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const parsed = recoverSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Revisa el correo indicado.',
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

  const redirectTo = recoveryRedirectUrl(await getRequestOrigin());
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

  return { status: 'success', message: SENT_MESSAGE, fieldErrors: {} };
}
