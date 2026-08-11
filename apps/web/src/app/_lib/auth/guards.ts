import { redirect } from 'next/navigation';

import { getCurrentUser, type ApplicationUser } from './current-user';

export async function requireAuthenticatedUser(): Promise<ApplicationUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(role: ApplicationUser['role']): Promise<ApplicationUser> {
  const user = await requireAuthenticatedUser();
  if (user.role !== role) redirect(user.role === 'teacher' ? '/sessions' : '/admin');
  return user;
}
