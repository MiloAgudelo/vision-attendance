import { describe, expect, it } from 'vitest';

import {
  DomainError,
  conflictError,
  isDomainError,
  notFoundError,
  translateDatabaseError,
  validationError,
  withTranslatedErrors,
} from './errors.js';

/** Imita la forma con la que postgres.js reporta una violación de restricción. */
function postgresError(code: string, constraintName: string): Error {
  return Object.assign(new Error(`error de prueba (${constraintName})`), {
    code,
    constraint_name: constraintName,
  });
}

describe('constructores de error de dominio', () => {
  it('marcan el código y llevan el mensaje al campo indicado', () => {
    expect(validationError('Mal.', { name: ['Mal.'] }).code).toBe('validation');
    expect(conflictError('Repetido.', 'code').fieldErrors).toEqual({ code: ['Repetido.'] });
    expect(notFoundError('No existe.').code).toBe('not_found');
    expect(isDomainError(new Error('otro'))).toBe(false);
  });
});

describe('translateDatabaseError — unicidad', () => {
  it('traduce el código estudiantil repetido', () => {
    const error = translateDatabaseError(postgresError('23505', 'students_student_code_unique'));

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('conflict');
    expect((error as DomainError).message).toBe(
      'Ya existe un estudiante con ese código estudiantil.',
    );
  });

  it('traduce el código de materia repetido', () => {
    expect(
      (translateDatabaseError(postgresError('23505', 'subjects_code_unique')) as DomainError)
        .message,
    ).toBe('Ya existe una materia con ese código.');
  });

  it('traduce el grupo repetido en la misma materia y periodo', () => {
    const error = translateDatabaseError(
      postgresError('23505', 'groups_subject_name_term_unique'),
    ) as DomainError;

    expect(error.message).toBe(
      'Ya existe un grupo con ese nombre para la misma materia y el mismo periodo.',
    );
    expect(error.fieldErrors['name']).toEqual([error.message]);
  });

  it('traduce la inscripción repetida', () => {
    expect(
      (
        translateDatabaseError(
          postgresError('23505', 'enrollments_group_student_unique'),
        ) as DomainError
      ).message,
    ).toBe('El estudiante ya está inscrito en este grupo.');
  });
});

describe('translateDatabaseError — CHECK del horario', () => {
  it('traduce el día de la semana fuera de 1–7', () => {
    const error = translateDatabaseError(
      postgresError('23514', 'schedules_weekday_range'),
    ) as DomainError;

    expect(error.code).toBe('validation');
    expect(error.message).toBe('El día de la semana debe estar entre 1 (lunes) y 7 (domingo).');
  });

  it('traduce la hora de fin anterior o igual a la de inicio', () => {
    expect(
      (translateDatabaseError(postgresError('23514', 'schedules_time_order')) as DomainError)
        .message,
    ).toBe('La hora de fin debe ser posterior a la hora de inicio.');
  });
});

describe('translateDatabaseError — errores envueltos', () => {
  it('encuentra la violación aunque Drizzle la envuelva en `cause`', () => {
    const wrapped = new Error('Failed query: insert into "students" …', {
      cause: postgresError('23505', 'students_student_code_unique'),
    });

    expect((translateDatabaseError(wrapped) as DomainError).message).toBe(
      'Ya existe un estudiante con ese código estudiantil.',
    );
  });

  it('no se cuelga con una cadena de `cause` cíclica', () => {
    const first = new Error('primero');
    const second = new Error('segundo', { cause: first });
    (first as Error & { cause?: unknown }).cause = second;

    expect(translateDatabaseError(first)).toBe(first);
  });
});

describe('translateDatabaseError — lo que no reconoce', () => {
  it('deja pasar intacto un fallo de infraestructura', () => {
    const original = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });

    expect(translateDatabaseError(original)).toBe(original);
  });

  it('deja pasar intacta una restricción que no sabe traducir', () => {
    const original = postgresError('23505', 'devices_name_unique');

    expect(translateDatabaseError(original)).toBe(original);
  });

  it('deja pasar intacto lo que ni siquiera es un objeto', () => {
    expect(translateDatabaseError('vaya')).toBe('vaya');
  });
});

describe('withTranslatedErrors', () => {
  it('devuelve el resultado cuando no hay fallo', async () => {
    await expect(withTranslatedErrors(async () => 7)).resolves.toBe(7);
  });

  it('lanza el error de negocio en vez de la excepción cruda', async () => {
    await expect(
      withTranslatedErrors(async () => {
        throw postgresError('23505', 'students_student_code_unique');
      }),
    ).rejects.toThrow('Ya existe un estudiante con ese código estudiantil.');
  });
});
