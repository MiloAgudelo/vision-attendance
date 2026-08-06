import { describe, expect, it } from 'vitest';

import { SUBJECT_NAME_MAX_LENGTH, subjectInputSchema } from './subjects';

describe('subjectInputSchema — casos válidos', () => {
  it('acepta una materia con código y nombre', () => {
    expect(
      subjectInputSchema.parse({ code: 'LAB-DES', name: 'Laboratorio de Desarrollo' }),
    ).toEqual({ code: 'LAB-DES', name: 'Laboratorio de Desarrollo' });
  });

  it('normaliza el código a mayúsculas y recorta espacios', () => {
    expect(subjectInputSchema.parse({ code: ' lab-des ', name: ' Laboratorio ' })).toEqual({
      code: 'LAB-DES',
      name: 'Laboratorio',
    });
  });
});

describe('subjectInputSchema — casos inválidos con mensaje en español', () => {
  it('rechaza el código vacío con un único mensaje', () => {
    const result = subjectInputSchema.safeParse({ code: '', name: 'Laboratorio' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'El código de la materia es obligatorio.',
    ]);
  });

  it('rechaza un código con espacios interiores', () => {
    const result = subjectInputSchema.safeParse({ code: 'LAB DES', name: 'Laboratorio' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'El código de la materia solo admite letras, dígitos y guiones.',
    );
  });

  it('rechaza el nombre vacío', () => {
    const result = subjectInputSchema.safeParse({ code: 'LAB-DES', name: '   ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El nombre de la materia es obligatorio.');
  });

  it('rechaza el nombre más largo que el máximo', () => {
    const result = subjectInputSchema.safeParse({
      code: 'LAB-DES',
      name: 'x'.repeat(SUBJECT_NAME_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `El nombre de la materia no puede superar los ${SUBJECT_NAME_MAX_LENGTH} caracteres.`,
    );
  });

  it('rechaza un valor que ni siquiera es texto', () => {
    const result = subjectInputSchema.safeParse({ code: 42, name: 'Laboratorio' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El código de la materia es obligatorio.');
  });
});
