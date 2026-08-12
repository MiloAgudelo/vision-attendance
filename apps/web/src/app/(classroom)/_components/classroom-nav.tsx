'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { logoutAction } from '@/app/login/actions';

interface ClassroomNavProps {
  fullName: string;
  role: 'admin' | 'teacher';
}

export function ClassroomNav({ fullName, role }: ClassroomNavProps) {
  const pathname = usePathname();

  const links = [
    { href: '/sessions', label: 'Sesiones' },
    ...(role === 'admin'
      ? [
          { href: '/events', label: 'Bitácora RFID' },
          { href: '/admin', label: 'Administración' },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <nav aria-label="Navegación del aula" className="flex flex-wrap gap-1">
        {links.map((link) => {
          const active =
            link.href === '/sessions'
              ? pathname.startsWith('/sessions') || pathname.startsWith('/students/')
              : pathname.startsWith(link.href);

          return (
            <Link
              className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                active
                  ? 'bg-teal-900 text-white'
                  : 'text-slate-700 hover:bg-teal-50 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium">{fullName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {role === 'admin' ? 'Administrador' : 'Profesor'}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            type="submit"
          >
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}
