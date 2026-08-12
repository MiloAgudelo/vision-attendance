/**
 * Secciones del panel de administración.
 *
 * Este armazón es propiedad de la lane W1 (`docs/agent-playbook.md` §4). Otras lanes añaden sus
 * pantallas colgando de este mismo layout: W2 sumará «Dispositivos» y W5 las vistas de asistencia,
 * cada una registrando aquí su entrada.
 */

export interface AdminSection {
  href: string;
  label: string;
  description: string;
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    href: '/admin',
    label: 'Panel',
    description: 'Resumen del dominio académico registrado en el sistema.',
  },
  {
    href: '/students',
    label: 'Estudiantes',
    description:
      'Alta, edición y baja de estudiantes. Solo se guardan nombre, código y estado (minimización de datos).',
  },
  {
    href: '/subjects',
    label: 'Materias',
    description: 'Catálogo de materias sobre el que se abren los grupos.',
  },
  {
    href: '/groups',
    label: 'Grupos',
    description:
      'Grupos por materia y periodo, con su ventana de sesión, sus inscripciones y su horario.',
  },
  {
    href: '/schedules',
    label: 'Horarios',
    description: 'Consulta del horario semanal de todos los grupos activos, en hora de Bogotá.',
  },
  {
    href: '/devices',
    label: 'Dispositivos',
    description:
      'Alta, revocación y modo de los lectores RFID autorizados a enviar eventos.',
  },
  {
    href: '/devices/enrollment',
    label: 'Enrolamiento',
    description: 'Asocia a un estudiante los UID capturados por un lector en modo enrolamiento.',
  },
  {
    href: '/sessions',
    label: 'Sesiones',
    description: 'Tablero de aula: sesiones en vivo, roster de presentes y ausentes, historial.',
  },
  {
    href: '/events',
    label: 'Bitácora RFID',
    description:
      'Consulta inmutable de eventos RFID recibidos (incluidos sin sesión o carnet desconocido).',
  },
];
