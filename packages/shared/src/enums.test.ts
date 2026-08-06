import { describe, expect, it } from 'vitest';

import {
  ATTENDANCE_SOURCES,
  CARD_STATUSES,
  CORRECTION_ACTIONS,
  DEVICE_MODES,
  DEVICE_STATUSES,
  EVENT_RESULTS,
  RECORD_STATUSES,
  USER_ROLES,
} from './enums.js';

/**
 * Estos valores están congelados por `docs/data-model.md`: la migración inicial crea los mismos
 * enums en Postgres. Si una prueba falla aquí, el esquema y el dominio se han desalineado.
 */
describe('enums de dominio', () => {
  it.each([
    ['user_role', USER_ROLES, ['admin', 'teacher']],
    ['record_status', RECORD_STATUSES, ['active', 'inactive']],
    ['card_status', CARD_STATUSES, ['active', 'inactive']],
    ['device_mode', DEVICE_MODES, ['normal', 'enrollment']],
    ['device_status', DEVICE_STATUSES, ['active', 'revoked']],
    [
      'event_result',
      EVENT_RESULTS,
      [
        'registered',
        'already_registered',
        'no_session',
        'not_enrolled',
        'unknown_card',
        'enrollment_captured',
        'error',
      ],
    ],
    ['attendance_source', ATTENDANCE_SOURCES, ['device', 'manual']],
    ['correction_action', CORRECTION_ACTIONS, ['mark_present', 'mark_absent', 'update']],
  ])('%s coincide con el modelo de datos', (_nombre, actual, esperado) => {
    expect([...actual]).toEqual(esperado);
  });

  it('no hay estados de asistencia "tarde" ni "justificado" (RN4, alcance §7)', () => {
    const todos: readonly string[] = [...EVENT_RESULTS, ...ATTENDANCE_SOURCES, ...RECORD_STATUSES];
    expect(todos).not.toContain('late');
    expect(todos).not.toContain('excused');
  });
});
