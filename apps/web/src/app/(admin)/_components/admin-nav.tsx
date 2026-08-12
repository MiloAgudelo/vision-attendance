'use client';

/**
 * Navegación entre las secciones del panel. Resalta la sección activa, y por eso es de cliente:
 * necesita conocer la ruta actual.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ADMIN_SECTIONS } from '../_lib/sections';

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de administración" className="flex flex-wrap gap-1">
      {ADMIN_SECTIONS.map((section) => {
        const active =
          section.href === '/admin'
            ? pathname === '/admin'
            : pathname === section.href ||
              (pathname.startsWith(`${section.href}/`) &&
                !ADMIN_SECTIONS.some(
                  (other) =>
                    other.href !== section.href &&
                    other.href.startsWith(`${section.href}/`) &&
                    (pathname === other.href || pathname.startsWith(`${other.href}/`)),
                ));

        return (
          <Link
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
            href={section.href}
            key={section.href}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
