import { redirect } from 'next/navigation';

import { getCurrentUser } from './_lib/auth/current-user';

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user?.role === 'admin' ? '/admin' : user?.role === 'teacher' ? '/sessions' : '/login');
}
