import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireRole = vi.hoisted(() => vi.fn());
const correctAttendance = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock('@/app/_lib/auth/guards', () => ({ requireRole }));
vi.mock('@/server/attendance/corrections', () => ({ correctAttendance }));
vi.mock('next/cache', () => ({ revalidatePath }));

import { correctAttendanceAction } from './actions';

const IDLE = { status: 'idle' as const, message: null, fieldErrors: {} };

beforeEach(() => {
  requireRole.mockReset();
  correctAttendance.mockReset();
  revalidatePath.mockReset();
});

describe('correctAttendanceAction', () => {
  it('impide que un profesor corrija asistencia', async () => {
    requireRole.mockRejectedValue(new Error('redirect:/sessions'));
    const formData = new FormData();
    formData.set('sessionId', 'session-1');
    formData.set('studentId', 'student-1');
    formData.set('present', 'true');
    formData.set('reason', 'Llegó con carnet prestado');

    await expect(correctAttendanceAction(IDLE, formData)).rejects.toThrow('redirect:/sessions');
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(correctAttendance).not.toHaveBeenCalled();
  });

  it('usa el userId de la sesión admin y ignora uno enviado por el cliente', async () => {
    requireRole.mockResolvedValue({
      id: 'admin-from-session',
      email: 'admin@example.test',
      fullName: 'Admin',
      role: 'admin',
    });
    correctAttendance.mockResolvedValue({
      correctionId: 'corr-1',
      attendanceId: 'att-1',
      action: 'mark_present',
    });

    const formData = new FormData();
    formData.set('sessionId', 'session-1');
    formData.set('studentId', 'student-1');
    formData.set('present', 'true');
    formData.set('reason', 'Ingreso validado en puerta');
    formData.set('userId', 'attacker-spoofed-id');

    const result = await correctAttendanceAction(IDLE, formData);

    expect(result.status).toBe('success');
    expect(correctAttendance).toHaveBeenCalledWith({
      sessionId: 'session-1',
      studentId: 'student-1',
      userId: 'admin-from-session',
      present: true,
      reason: 'Ingreso validado en puerta',
      notes: null,
    });
    expect(correctAttendance.mock.calls[0]?.[0].userId).not.toBe('attacker-spoofed-id');
  });
});
