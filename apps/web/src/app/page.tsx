export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
        Institución Universitaria Visión de las Américas
      </p>

      <h1 className="text-3xl font-semibold text-balance">Registro de asistencia mediante RFID</h1>

      <p className="text-base leading-relaxed text-slate-600 dark:text-slate-300">
        El sistema está en construcción. Ya se puede administrar el dominio académico —estudiantes,
        materias, grupos, inscripciones y horarios—; la vista de asistencia en vivo todavía no
        existe.
      </p>

      <p>
        <a
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          href="/admin"
        >
          Ir al panel de administración
        </a>
      </p>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Estado del servicio:{' '}
        <a
          className="underline underline-offset-4 hover:no-underline"
          href="/api/health"
          rel="noreferrer"
        >
          /api/health
        </a>
      </p>
    </main>
  );
}
