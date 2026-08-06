/**
 * Piezas visuales del panel de administración.
 *
 * Componentes de servidor sin estado, solo Tailwind: no se añade ninguna librería de interfaz
 * (`docs/architecture.md` §2, paquete `ui` deliberadamente no creado).
 */

import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      {title ? (
        <div className="mb-4 space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Mensaje para una tabla o una lista sin filas. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  );
}

/** Distintivo de estado. `inactive` = dado de baja (la fila sigue existiendo). */
export function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  return status === 'active' ? (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
      Activo
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      Dado de baja
    </span>
  );
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
          {head}
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-middle">{children}</td>;
}
