'use client';

import { useEffect } from 'react';

/**
 * Si Auth redirige a `/` o `/login` (Site URL sin path), el hash o `code` no deben perderse:
 * los mandamos al callback que establece la sesión.
 */
export function AuthCallbackCatcher() {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (pathname.startsWith('/auth/') || pathname.startsWith('/login')) return;

    const hasQuery = /(?:^|[?&])(?:code|token_hash)=/.test(search);
    const hasHash = /access_token=|type=recovery/.test(hash);
    if (!hasQuery && !hasHash) return;

    window.location.replace(`/auth/callback${search}${hash}`);
  }, []);

  return null;
}
