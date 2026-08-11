import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionRoster = vi.hoisted(() => vi.fn());
const listClassSessions = vi.hoisted(() => vi.fn());
const listStudentAttendanceHistory = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/server/attendance/queries', () => ({
  getSessionRoster,
  listClassSessions,
  listStudentAttendanceHistory,
}));

import {
  listAccessibleSessions,
  loadAccessibleSessionRoster,
  loadAccessibleStudentHistory,
} from './access';

const admin = {
  id: 'admin-1',
  email: 'admin@example.test',
  fullName: 'Admin',
  role: 'admin' as const,
};

const teacher = {
  id: 'teacher-1',
  email: 'teacher@example.test',
  fullName: 'Profesor',
  role: 'teacher' as const,
};

const ownSession = {
  id: 'session-own',
  sessionDate: '2026-08-11',
  scheduledStart: new Date('2026-08-11T23:00:00.000Z'),
  scheduledEnd: new Date('2026-08-12T01:00:00.000Z'),
  groupId: 'group-own',
  groupName: 'G1',
  subjectCode: 'LAB-DES',
  subjectName: 'Laboratorio',
};

const foreignSession = {
  ...ownSession,
  id: 'session-foreign',
  groupId: 'group-foreign',
};

beforeEach(() => {
  getSessionRoster.mockReset();
  listClassSessions.mockReset();
  listStudentAttendanceHistory.mockReset();
  notFound.mockClear();
});

describe('acceso a sesiones e historial', () => {
  it('el profesor solo lista sesiones de sus grupos', async () => {
    listClassSessions.mockResolvedValue([ownSession]);
    await expect(listAccessibleSessions(teacher)).resolves.toEqual([ownSession]);
    expect(listClassSessions).toHaveBeenCalledWith({ teacherId: teacher.id, limit: 100 });
  });

  it('el administrador lista todas las sesiones', async () => {
    listClassSessions.mockResolvedValue([ownSession, foreignSession]);
    await expect(listAccessibleSessions(admin)).resolves.toHaveLength(2);
    expect(listClassSessions).toHaveBeenCalledWith({ limit: 100 });
  });

  it('el profesor no consulta una sesión de un grupo ajeno', async () => {
    getSessionRoster.mockResolvedValue({ session: foreignSession, students: [] });
    listClassSessions.mockResolvedValue([ownSession]);

    await expect(loadAccessibleSessionRoster(foreignSession.id, teacher)).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('el profesor consulta el roster de su propia sesión', async () => {
    const roster = {
      session: ownSession,
      students: [
        {
          id: 'stu-1',
          studentCode: '202410001',
          fullName: 'Ana',
          present: true,
          checkedInAt: new Date('2026-08-11T23:05:00.000Z'),
          minutesFromStart: 5,
          source: 'device' as const,
          notes: null,
        },
        {
          id: 'stu-2',
          studentCode: '202410002',
          fullName: 'Bruno',
          present: false,
          checkedInAt: null,
          minutesFromStart: null,
          source: null,
          notes: null,
        },
      ],
    };
    getSessionRoster.mockResolvedValue(roster);
    listClassSessions.mockResolvedValue([ownSession]);

    await expect(loadAccessibleSessionRoster(ownSession.id, teacher)).resolves.toEqual(roster);
  });

  it('el profesor no consulta el historial de un estudiante ajeno', async () => {
    listStudentAttendanceHistory.mockResolvedValue([
      {
        attendanceId: 'att-1',
        checkedInAt: new Date(),
        source: 'device',
        notes: null,
        ...foreignSession,
      },
    ]);
    listClassSessions.mockResolvedValue([ownSession]);
    getSessionRoster.mockResolvedValue({ session: ownSession, students: [] });

    await expect(loadAccessibleStudentHistory('stu-x', teacher)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
