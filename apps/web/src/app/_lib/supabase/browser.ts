import { createBrowserClient } from '@supabase/ssr';

import { getSupabasePublicConfig } from './config';

/** Cliente Auth de navegador: intercambia `code` / hash del enlace de recuperación. */
export function createSupabaseBrowserClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey);
}
