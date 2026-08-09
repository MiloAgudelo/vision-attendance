import { describe, expect, it } from 'vitest';

import { ATTENDANCE_TIME_ZONE, bogotaLocalDateTimeToUtc, getBogotaDateParts } from './timezone';

describe('zona horaria de asistencia (RN10)', () => {
  it('convierte una hora local de Bogotá al instante UTC correcto', () => {
    expect(ATTENDANCE_TIME_ZONE).toBe('America/Bogota');
    expect(bogotaLocalDateTimeToUtc('2026-08-11', '18:00:00').toISOString()).toBe(
      '2026-08-11T23:00:00.000Z',
    );
  });

  it('obtiene fecha local y día ISO sin depender de la zona del proceso', () => {
    expect(getBogotaDateParts(new Date('2026-08-12T02:30:00.000Z'))).toEqual({
      date: '2026-08-11',
      isoWeekday: 2,
    });
  });

  it('rechaza fecha u hora local malformadas', () => {
    expect(() => bogotaLocalDateTimeToUtc('11/08/2026', '18:00')).toThrow('Fecha local inválida');
    expect(() => bogotaLocalDateTimeToUtc('2026-08-11', '25:00')).toThrow('Hora local inválida');
  });
});
