import { describe, expect, it } from 'vitest';

import { getSupabasePublicConfig } from './config';

describe('getSupabasePublicConfig', () => {
  it('prefiere la publishable key actual', () => {
    expect(
      getSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_actual',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon_legacy',
      }),
    ).toEqual({
      url: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_actual',
    });
  });

  it('admite la anon key heredada del entorno existente', () => {
    expect(
      getSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon_local',
      }),
    ).toEqual({ url: 'http://127.0.0.1:54321', publishableKey: 'anon_local' });
  });

  it('queda sin configurar si faltan valores o la URL es insegura', () => {
    expect(getSupabasePublicConfig({})).toBeNull();
    expect(
      getSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'javascript:alert(1)',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toBeNull();
  });
});
