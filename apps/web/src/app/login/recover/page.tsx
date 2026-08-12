import Image from 'next/image';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/app/_lib/auth/current-user';

import { RecoverForm } from './recover-form';

export default async function RecoverPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/sessions');

  return (
    <main className="flex min-h-dvh items-center bg-slate-50 px-6 py-12 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-3">
          <Image
            alt=""
            aria-hidden
            className="rounded-lg bg-white object-contain p-1"
            height={48}
            src="/logo-institucional.png"
            width={48}
          />
          <p className="text-sm font-medium leading-tight text-slate-700 dark:text-slate-200">
            Visión de las Américas
          </p>
        </div>

        <h1 className="mt-10 text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance dark:text-white">
          Recuperar contraseña
        </h1>
        <p className="mt-3 max-w-prose text-base leading-7 text-slate-600 dark:text-slate-300">
          Te enviamos un enlace al correo institucional para elegir una contraseña nueva. El enlace
          abre esta misma aplicación, no localhost.
        </p>

        <RecoverForm />
      </div>
    </main>
  );
}
