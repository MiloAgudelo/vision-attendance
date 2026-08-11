export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

type SupabaseEnvironment = Record<string, string | undefined>;

/**
 * Lee la configuración pública de Auth sin hacer fallar builds locales que aún no conectan
 * Supabase. La anon key heredada sigue admitida como compatibilidad; proyectos nuevos deben usar
 * la publishable key actual.
 */
export function getSupabasePublicConfig(
  environment: SupabaseEnvironment = process.env,
): SupabasePublicConfig | null {
  const url = environment['NEXT_PUBLIC_SUPABASE_URL']?.trim();
  const publishableKey =
    environment['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']?.trim() ||
    environment['NEXT_PUBLIC_SUPABASE_ANON_KEY']?.trim();
  if (!url || !publishableKey) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }

  return { url, publishableKey };
}
