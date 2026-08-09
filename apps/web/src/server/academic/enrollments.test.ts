import { describe, expect, it } from 'vitest';

import { enrollmentInputSchema } from './enrollments';

const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const STUDENT_ID = '44444444-4444-4444-8444-444444444444';

describe('enrollmentInputSchema', () => {
  it('acepta un par grupo/estudiante válido', () => {
    expect(enrollmentInputSchema.parse({ groupId: GROUP_ID, studentId: STUDENT_ID })).toEqual({
      groupId: GROUP_ID,
      studentId: STUDENT_ID,
    });
  });

  it('rechaza un estudiante sin seleccionar con mensaje en español', () => {
    const result = enrollmentInputSchema.safeParse({ groupId: GROUP_ID, studentId: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Selecciona un estudiante válido.');
  });

  it('rechaza un grupo que no es un identificador', () => {
    const result = enrollmentInputSchema.safeParse({ groupId: 'G1', studentId: STUDENT_ID });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El grupo indicado no es válido.');
  });

  it('rechaza el objeto vacío señalando los dos campos', () => {
    const result = enrollmentInputSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual([
      'groupId',
      'studentId',
    ]);
  });
});
