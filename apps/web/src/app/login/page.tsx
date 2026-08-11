import Image from 'next/image';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '../_lib/auth/current-user';

import { LoginForm } from './login-form';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/sessions');

  return (
    <main className="grid min-h-dvh bg-slate-50 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.72fr)] dark:bg-slate-950">
      <section className="hidden bg-slate-950 px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <Image
            alt="Institución Universitaria Visión de las Américas"
            className="rounded-xl bg-white object-contain p-1.5"
            height={64}
            priority
            src="/logo-institucional.png"
            width={64}
          />
          <p className="max-w-xs text-sm font-medium leading-snug text-slate-200">
            Institución Universitaria Visión de las Américas
          </p>
        </div>

        <div className="max-w-xl pb-10">
          <h1 className="max-w-lg text-4xl font-semibold tracking-[-0.035em] text-balance">
            La asistencia del aula, clara mientras la clase ocurre.
          </h1>
          <p className="mt-5 max-w-prose text-base leading-7 text-slate-300">
            Consulta quién ya registró su ingreso, identifica ausencias y conserva una trazabilidad
            verificable de cada lectura RFID.
          </p>
        </div>

        <p className="text-sm text-slate-400">Registro de asistencia RFID</p>
      </section>

      <section className="flex items-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-3 lg:hidden">
            <Image
              alt=""
              aria-hidden
              className="rounded-lg bg-white object-contain p-1"
              height={48}
              priority
              src="/logo-institucional.png"
              width={48}
            />
            <p className="text-sm font-medium leading-tight text-slate-700 dark:text-slate-200">
              Visión de las Américas
            </p>
          </div>

          <h2 className="mt-10 text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance lg:mt-0 dark:text-white">
            Ingresa a tu cuenta
          </h2>
          <p className="mt-3 max-w-prose text-base leading-7 text-slate-600 dark:text-slate-300">
            Usa las credenciales asignadas por la institución.
          </p>

          <LoginForm />

          <p className="mt-7 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Si no puedes ingresar, solicita al administrador que verifique el estado y el rol de tu
            cuenta.
          </p>
        </div>
      </section>
    </main>
  );
}
