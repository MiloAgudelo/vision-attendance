/**
 * Proyección del roster para el tablero: presentes y ausentes calculados (RN5).
 */

import type { SessionRosterStudent } from '@/server/attendance/queries';

export interface RosterColumns {
  present: SessionRosterStudent[];
  absent: SessionRosterStudent[];
  presentCount: number;
  absentCount: number;
  total: number;
}

export function splitRoster(students: SessionRosterStudent[]): RosterColumns {
  const present = students.filter((student) => student.present);
  const absent = students.filter((student) => !student.present);
  return {
    present,
    absent,
    presentCount: present.length,
    absentCount: absent.length,
    total: students.length,
  };
}
