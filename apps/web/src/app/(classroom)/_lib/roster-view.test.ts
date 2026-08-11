import { describe, expect, it } from 'vitest';

import { splitRoster } from './roster-view';

describe('splitRoster', () => {
  it('calcula ausentes como inscritos sin asistencia', () => {
    const columns = splitRoster([
      {
        id: '1',
        studentCode: 'A',
        fullName: 'Presente',
        present: true,
        checkedInAt: new Date('2026-08-11T23:05:00.000Z'),
        minutesFromStart: 5,
        source: 'device',
        notes: null,
      },
      {
        id: '2',
        studentCode: 'B',
        fullName: 'Ausente',
        present: false,
        checkedInAt: null,
        minutesFromStart: null,
        source: null,
        notes: null,
      },
      {
        id: '3',
        studentCode: 'C',
        fullName: 'También ausente',
        present: false,
        checkedInAt: null,
        minutesFromStart: null,
        source: null,
        notes: null,
      },
    ]);

    expect(columns.presentCount).toBe(1);
    expect(columns.absentCount).toBe(2);
    expect(columns.total).toBe(3);
    expect(columns.absent.map((student) => student.fullName)).toEqual([
      'Ausente',
      'También ausente',
    ]);
  });
});
