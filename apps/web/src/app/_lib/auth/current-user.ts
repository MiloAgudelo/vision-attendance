import { getDatabase, users, type Database } from '@va/db';
import { eq } from 'drizzle-orm';

import { createSupabaseServerClient } from '../supabase/server';

export interface ApplicationUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'teacher';
}

/** El rol se resuelve en `public.users`, nunca desde metadata editable del JWT. */
export async function findActiveApplicationUser(
  authUserId: string,
  database: Database = getDatabase(),
): Promise<ApplicationUser | null> {
  const [user] = await database
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, authUserId))
    .limit(1);

  if (!user || user.status !== 'active') return null;
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

/** Obtiene una identidad validada por Supabase Auth y la cruza con la cuenta local activa. */
export async function getCurrentUser(): Promise<ApplicationUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  return findActiveApplicationUser(user.id);
}
