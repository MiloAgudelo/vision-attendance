import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabasePublicConfig } from './config';

/** Cliente SSR para Server Components, Actions y Route Handlers. */
export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies. El proxy refresca la sesión y sí puede;
          // Server Actions y Route Handlers entran por la rama que admite `set`.
        }
      },
    },
  });
}
