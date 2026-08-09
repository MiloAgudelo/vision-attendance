import Link from 'next/link';

import {
  listAssignableStudents,
  listPendingCards,
  listRecentCaptures,
} from '@/server/devices/enrollment';

import { formatBogota } from '../format';
import { AssignCardForm } from './assign-card-form';

/** Lo que interesa aquí es lo que el lector acaba de capturar: nunca se sirve cacheado. */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Enrolamiento de carnets · Registro de asistencia RFID',
};

export default async function EnrollmentPage() {
  const [pendingCards, students, captures] = await Promise.all([
    listPendingCards(),
    listAssignableStudents(),
    listRecentCaptures(),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Administración
        </p>
        <h1 className="text-2xl font-semibold">Enrolamiento de carnets</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Un lector en modo enrolamiento captura el UID de cada carnet desconocido que lee. Aquí se
          asocian a un estudiante. El modo se cambia desde{' '}
          <Link className="underline underline-offset-4" href="/devices">
            dispositivos
          </Link>
          .
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Carnets capturados sin asignar</h2>

        {pendingCards.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No hay carnets pendientes. Pon un lector en modo enrolamiento y acerca el carnet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    UID
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Capturado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Asociar a un estudiante
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingCards.map((card) => (
                  <tr
                    key={card.id}
                    className="border-t border-slate-200 align-top dark:border-slate-800"
                  >
                    <th scope="row" className="px-4 py-3 font-mono font-medium">
                      {card.uid}
                    </th>
                    <td className="px-4 py-3">{formatBogota(card.createdAt)}</td>
                    <td className="px-4 py-3">
                      <AssignCardForm cardId={card.id} cardUid={card.uid} students={students} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400">
          ¿El estudiante todavía no existe? Créalo primero en{' '}
          <Link className="underline underline-offset-4" href="/students">
            estudiantes
          </Link>{' '}
          y vuelve aquí a asociar su carnet.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Últimas capturas</h2>

        {captures.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Todavía no se ha capturado ningún carnet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    UID
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Dispositivo
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Hora del servidor
                  </th>
                </tr>
              </thead>
              <tbody>
                {captures.map((capture) => (
                  <tr
                    key={`${capture.deviceName}/${capture.eventId}`}
                    className="border-t border-slate-200 dark:border-slate-800"
                  >
                    <th scope="row" className="px-4 py-3 font-mono font-medium">
                      {capture.cardUid}
                    </th>
                    <td className="px-4 py-3 font-mono">{capture.deviceName}</td>
                    <td className="px-4 py-3">{formatBogota(capture.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
