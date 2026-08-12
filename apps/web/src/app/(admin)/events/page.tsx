import { requireRole } from '@/app/_lib/auth/guards';
import { listRfidEventLog } from '@/server/attendance/queries';

import { PageHeader, Panel, Table, Td, Th, EmptyState } from '../_components/ui';
import { formatBogota } from '../devices/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Bitácora RFID · Registro de asistencia RFID',
};

const RESULT_LABEL: Record<string, string> = {
  registered: 'Registrado',
  already_registered: 'Ya registrado',
  no_session: 'Sin sesión',
  not_enrolled: 'No inscrito',
  unknown_card: 'Carnet desconocido',
  enrollment_captured: 'Enrolamiento',
  error: 'Error',
};

export default async function RfidEventsPage() {
  await requireRole('admin');
  const events = await listRfidEventLog({ limit: 150 });

  return (
    <>
      <PageHeader
        description="Bitácora inmutable de lecturas RFID: cada evento recibido queda trazado con su hora de servidor."
        title="Bitácora de eventos RFID"
      />

      <Panel title="Últimos eventos">
        {events.length === 0 ? (
          <EmptyState>Todavía no hay eventos RFID registrados.</EmptyState>
        ) : (
          <Table
            head={
              <tr>
                <Th>Recibido</Th>
                <Th>Dispositivo</Th>
                <Th>UID</Th>
                <Th>Estudiante</Th>
                <Th>Resultado</Th>
              </tr>
            }
          >
            {events.map((event) => (
              <tr key={event.id}>
                <Td>
                  <span className="tabular-nums">{formatBogota(event.receivedAt)}</span>
                </Td>
                <Td>{event.deviceName}</Td>
                <Td>
                  <code className="text-xs">{event.cardUid}</code>
                </Td>
                <Td>{event.studentName ? `${event.studentName} (${event.studentCode})` : '—'}</Td>
                <Td>{RESULT_LABEL[event.result] ?? event.result}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
