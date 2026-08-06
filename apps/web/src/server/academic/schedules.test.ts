import { describe, expect, it } from 'vitest';

import { WEEKDAYS, normalizeTimeOfDay, scheduleInputSchema, weekdayLabel } from './schedules.js';

const GROUP_ID = '55555555-5555-4555-8555-555555555555';

function base(overrides: Record<string, unknown> = {}) {
  return {
    groupId: GROUP_ID,
    weekday: 2,
    startTime: '18:00',
    endTime: '20:00',
    room: 'Bloque A - 301',
    ...overrides,
  };
}

describe('días de la semana', () => {
  it('usa la numeración ISO-8601: 1 es lunes y 7 es domingo', () => {
    expect(WEEKDAYS.map((day) => day.iso)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weekdayLabel(1)).toBe('Lunes');
    expect(weekdayLabel(7)).toBe('Domingo');
  });
});

describe('scheduleInputSchema — casos válidos', () => {
  it('normaliza las horas a HH:MM:SS, el formato de la columna `time`', () => {
    const parsed = scheduleInputSchema.parse(base());

    expect(parsed.startTime).toBe('18:00:00');
    expect(parsed.endTime).toBe('20:00:00');
  });

  it('acepta horas que ya vienen con segundos', () => {
    expect(normalizeTimeOfDay('18:00:00')).toBe('18:00:00');
    expect(scheduleInputSchema.parse(base({ startTime: '18:30:00' })).startTime).toBe('18:30:00');
  });

  it('convierte a número el día que llega como texto desde el formulario', () => {
    expect(scheduleInputSchema.parse(base({ weekday: '4' })).weekday).toBe(4);
  });

  it('guarda el salón vacío como NULL', () => {
    expect(scheduleInputSchema.parse(base({ room: '   ' })).room).toBeNull();
    expect(scheduleInputSchema.parse(base({ room: undefined })).room).toBeNull();
  });
});

describe('scheduleInputSchema — casos inválidos con mensaje en español', () => {
  it('rechaza un día fuera del rango 1–7 (mismo criterio que el CHECK del esquema)', () => {
    for (const weekday of [0, 8, -1]) {
      const result = scheduleInputSchema.safeParse(base({ weekday }));

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'El día de la semana debe estar entre 1 (lunes) y 7 (domingo).',
      );
    }
  });

  it('rechaza la hora de fin igual a la de inicio', () => {
    const result = scheduleInputSchema.safeParse(base({ startTime: '18:00', endTime: '18:00' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'La hora de fin debe ser posterior a la hora de inicio.',
    );
    expect(result.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('rechaza la hora de fin anterior a la de inicio', () => {
    const result = scheduleInputSchema.safeParse(base({ startTime: '20:00', endTime: '18:00' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'La hora de fin debe ser posterior a la hora de inicio.',
    );
  });

  it('rechaza una hora con formato imposible', () => {
    const result = scheduleInputSchema.safeParse(base({ startTime: '25:00' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('La hora de inicio debe tener el formato HH:MM.');
  });

  it('rechaza la hora de inicio vacía con un único mensaje', () => {
    const result = scheduleInputSchema.safeParse(base({ startTime: '' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'La hora de inicio es obligatoria.',
    ]);
  });

  it('rechaza un salón más largo que el máximo', () => {
    const result = scheduleInputSchema.safeParse(base({ room: 'x'.repeat(61) }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El salón no puede superar los 60 caracteres.');
  });
});
