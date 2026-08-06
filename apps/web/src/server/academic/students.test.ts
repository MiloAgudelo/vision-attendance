import { describe, expect, it } from 'vitest';

import { isDomainError } from './errors.js';
import { STUDENT_CODE_MAX_LENGTH, studentInputSchema } from './students.js';
import { parseInput } from './validation.js';

describe('studentInputSchema — casos válidos', () => {
  it('acepta un estudiante con código y nombre', () => {
    const parsed = studentInputSchema.parse({
      studentCode: '202410001',
      fullName: 'Ana María Restrepo',
    });

    expect(parsed).toEqual({ studentCode: '202410001', fullName: 'Ana María Restrepo' });
  });

  it('recorta los espacios sobrantes de ambos campos', () => {
    const parsed = studentInputSchema.parse({
      studentCode: '  202410002  ',
      fullName: '  Bruno Cárdenas Ríos  ',
    });

    expect(parsed).toEqual({ studentCode: '202410002', fullName: 'Bruno Cárdenas Ríos' });
  });

  it('normaliza el código a mayúsculas para que sea comparable', () => {
    expect(
      studentInputSchema.parse({ studentCode: 'lab-des-01', fullName: 'Carolina Ospina' })
        .studentCode,
    ).toBe('LAB-DES-01');
  });
});

describe('studentInputSchema — casos inválidos con mensaje en español', () => {
  it('rechaza el código vacío', () => {
    const result = studentInputSchema.safeParse({ studentCode: '   ', fullName: 'Ana Restrepo' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El código estudiantil es obligatorio.');
  });

  it('rechaza el código con caracteres que no son letras, dígitos ni guiones', () => {
    const result = studentInputSchema.safeParse({
      studentCode: '2024/1000 1',
      fullName: 'Ana Restrepo',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'El código estudiantil solo admite letras, dígitos y guiones.',
    );
  });

  it('rechaza el código más largo que el máximo', () => {
    const result = studentInputSchema.safeParse({
      studentCode: '1'.repeat(STUDENT_CODE_MAX_LENGTH + 1),
      fullName: 'Ana Restrepo',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `El código estudiantil no puede superar los ${STUDENT_CODE_MAX_LENGTH} caracteres.`,
    );
  });

  it('rechaza el nombre vacío', () => {
    const result = studentInputSchema.safeParse({ studentCode: '202410001', fullName: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('El nombre completo es obligatorio.');
  });

  it('rechaza un campo ausente en vez de dejarlo pasar como undefined', () => {
    expect(studentInputSchema.safeParse({ studentCode: '202410001' }).success).toBe(false);
  });

  it('no acepta campos extra: minimización de datos (alcance §16)', () => {
    const parsed = studentInputSchema.parse({
      studentCode: '202410001',
      fullName: 'Ana Restrepo',
      email: 'ana@example.com',
      program: 'Ingeniería',
    });

    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('program');
  });
});

describe('parseInput sobre el estudiante', () => {
  it('convierte el fallo de Zod en un error de dominio con los mensajes por campo', () => {
    try {
      parseInput(studentInputSchema, { studentCode: '', fullName: '' });
      expect.unreachable('parseInput debía fallar');
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      if (!isDomainError(error)) return;

      expect(error.code).toBe('validation');
      expect(error.message).toBe('El código estudiantil es obligatorio.');
      expect(error.fieldErrors).toEqual({
        studentCode: ['El código estudiantil es obligatorio.'],
        fullName: ['El nombre completo es obligatorio.'],
      });
    }
  });
});
