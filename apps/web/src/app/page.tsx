import { redirect } from 'next/navigation';

import { getCurrentUser } from './_lib/auth/current-user';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.code === 'string' ? params.code : undefined;
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : undefined;
  if (code || tokenHash) {
    const forwarded = new URLSearchParams();
    if (code) forwarded.set('code', code);
    if (tokenHash) forwarded.set('token_hash', tokenHash);
    if (typeof params.type === 'string') forwarded.set('type', params.type);
    if (typeof params.next === 'string' && params.next.startsWith('/')) {
      forwarded.set('next', params.next);
    }
    redirect(`/auth/callback?${forwarded}`);
  }

  const user = await getCurrentUser();
  redirect(user?.role === 'admin' ? '/admin' : user?.role === 'teacher' ? '/sessions' : '/login');
}
