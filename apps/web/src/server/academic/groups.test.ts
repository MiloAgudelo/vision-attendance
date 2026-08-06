import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SESSION_WINDOW_MINUTES,
  MAX_SESSION_WINDOW_MINUTES,
  groupInputSchema,
} from './groups.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const TEACHER_ID = '22222222-2222-4222-8222-222222222222';

describe('groupInputSchema — casos válidos', () => {
  it('acepta un grupo completo', () => {
    expect(
      groupInputSchema.parse({
        subjectId: SUBJECT_ID,
        name: 'G1',
        term: '2026-2',
        teacherId: TEACHER_ID,
        sessionWindowMinutes: 45,
      }),
    ).toEqual({
      subjectId: SUBJECT_ID,
      name: 'G1',
      term: '2026-2',
      teacherId: TEACHER_ID,
      sessionWindowMinutes: 45,
    });
  });

  it('aplica la ventana de 60 minutos por defecto cuando no se envía (RN2)', () => {
    const parsed = groupInputSchema.parse({ subjectId: SUBJECT_ID, name: 'G1', term: '2026-2' });

    expect(parsed.sessionWindowMinutes).toBe(DEFAULT_SESSION_WINDOW_MINUTES);
    expect(DEFAULT_SESSION_WINDOW_MINUTES).toBe(60);
  });

  it('convierte a número la ventana que llega como texto desde el formulario', () => {
    expect(
      groupInputSchema.parse({
        subjectId: SUBJECT_ID,
        name: 'G1',
        term: '2026-2',
        sessionWindowMinutes: '30',
      }).sessionWindowMinutes,
    ).toBe(30);
  });

  it('deja el grupo sin profesor cuando no se selecciona ninguno', () => {
    expect(
      groupInputSchema.parse({
        subjectId: SUBJECT_ID,
        name: 'G1',
        term: '2026-2',
        teacherId: null,
      }).teacherId,
    ).toBeNull();

    expect(
      groupInputSchema.parse({ subjectId: SUBJECT_ID, name: 'G1', term: '2026-2' }).teacherId,
    ).toBeNull();
  });
});

describe('groupInputSchema — casos inválidos con mensaje en español', () => {
  it('rechaza una materia que no es un identificador', () => {
    const result = groupInputSchema.safeParse({ subjectId: '', name: 'G1', term: '2026-2' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Selecciona una materia válida.');
  });

  it('rechaza el nombre del grupo vacío', () => {
    const result = groupInputSchema.safeParse({ subjectId: SUBJECT_ID, name: ' ', term: '2026-2' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El nombre del grupo es obligatorio.');
  });

  it('rechaza el periodo académico vacío', () => {
    const result = groupInputSchema.safeParse({ subjectId: SUBJECT_ID, name: 'G1', term: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El periodo académico es obligatorio.');
  });

  it('rechaza una ventana de sesión negativa', () => {
    const result = groupInputSchema.safeParse({
      subjectId: SUBJECT_ID,
      name: 'G1',
      term: '2026-2',
      sessionWindowMinutes: -1,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('La ventana de sesión no puede ser negativa.');
  });

  it('rechaza una ventana de sesión con decimales', () => {
    const result = groupInputSchema.safeParse({
      subjectId: SUBJECT_ID,
      name: 'G1',
      term: '2026-2',
      sessionWindowMinutes: 12.5,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'La ventana de sesión debe ser un número entero de minutos.',
    );
  });

  it('rechaza una ventana de sesión por encima del tope', () => {
    const result = groupInputSchema.safeParse({
      subjectId: SUBJECT_ID,
      name: 'G1',
      term: '2026-2',
      sessionWindowMinutes: MAX_SESSION_WINDOW_MINUTES + 1,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `La ventana de sesión no puede superar los ${MAX_SESSION_WINDOW_MINUTES} minutos.`,
    );
  });

  it('rechaza un profesor que no es un identificador', () => {
    const result = groupInputSchema.safeParse({
      subjectId: SUBJECT_ID,
      name: 'G1',
      term: '2026-2',
      teacherId: 'la-profesora',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El profesor seleccionado no es válido.');
  });
});
