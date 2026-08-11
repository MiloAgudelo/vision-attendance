import Link from 'next/link';

import { requireRole } from '@/app/_lib/auth/guards';
import { listDevices } from '@/server/devices/devices';

import { DeviceRowActions } from './device-row-actions';
import { formatBogota } from './format';
import { NewDeviceForm } from './new-device-form';

/** El listado refleja el estado real de los lectores en cada carga. */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dispositivos · Registro de asistencia RFID',
};

const MODE_LABEL = {
  normal: 'Normal',
  enrollment: 'Enrolamiento',
} as const;

const STATUS_LABEL = {
  active: 'Activo',
  revoked: 'Revocado',
} as const;

export default async function DevicesPage() {
  await requireRole('admin');

  const devices = await listDevices();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Administración
        </p>
        <h1 className="text-2xl font-semibold">Dispositivos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Lectores autorizados a enviar lecturas a <code>POST /api/v1/events</code>. En modo{' '}
          <strong>enrolamiento</strong> capturan los carnets desconocidos para asociarlos después en{' '}
          <Link className="underline underline-offset-4" href="/devices/enrollment">
            enrolamiento de carnets
          </Link>
          .
        </p>
      </header>

      <NewDeviceForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Dispositivos registrados</h2>

        {devices.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Todavía no hay ningún dispositivo registrado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Modo
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Salón
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Última conexión
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Firmware
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr
                    key={device.id}
                    className="border-t border-slate-200 align-top dark:border-slate-800"
                  >
                    <th scope="row" className="px-4 py-3 font-mono font-medium">
                      {device.name}
                    </th>
                    <td className="px-4 py-3">{STATUS_LABEL[device.status]}</td>
                    <td className="px-4 py-3">{MODE_LABEL[device.mode]}</td>
                    <td className="px-4 py-3">{device.room ?? '—'}</td>
                    <td className="px-4 py-3">{formatBogota(device.lastSeenAt)}</td>
                    <td className="px-4 py-3">{device.firmwareVersion ?? '—'}</td>
                    <td className="px-4 py-3">
                      <DeviceRowActions
                        deviceId={device.id}
                        deviceName={device.name}
                        mode={device.mode}
                        status={device.status}
                      />
                    </td>
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
