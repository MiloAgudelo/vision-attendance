'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createSupabaseBrowserClient } from '@/app/_lib/supabase/browser';
import { completeAuthCallback } from '@/app/_lib/supabase/complete-callback';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Validando el enlace de recuperación…');

  useEffect(() => {
    const run = async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setMessage('El inicio de sesión no está configurado.');
        router.replace('/login');
        return;
      }

      const result = await completeAuthCallback(supabase, window.location.href);
      if (!result.ok) {
        setMessage(result.message);
        router.replace('/login/recover');
        return;
      }

      router.replace(result.next);
    };

    void run();
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </main>
  );
}
