/**
 * Errores de negocio del dominio académico.
 *
 * Toda función de `src/server/academic/` falla con un {@link DomainError}: nunca deja escapar una
 * excepción cruda de PostgreSQL. Así la capa de interfaz puede mostrar un mensaje en español
 * (`docs/agent-playbook.md` §4, W1) en vez de un 500 sin forma.
 */

/**
 * Naturaleza del fallo. Los identificadores van en inglés, como el resto del código; los mensajes
 * que acompañan al error van en español porque llegan tal cual a la pantalla.
 */
export type DomainErrorCode = 'validation' | 'conflict' | 'not_found';

/** Mensajes de validación por campo del formulario, indexados por el nombre del campo. */
export type FieldErrors = Record<string, string[]>;

/** Error de negocio con mensaje listo para mostrar al administrador. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fieldErrors: FieldErrors;

  constructor(code: DomainErrorCode, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/** Datos que no cumplen las reglas de forma del dominio. */
export function validationError(message: string, fieldErrors: FieldErrors = {}): DomainError {
  return new DomainError('validation', message, fieldErrors);
}

/** Choque con una restricción de unicidad o con el estado actual de los datos. */
export function conflictError(message: string, field?: string): DomainError {
  return new DomainError('conflict', message, field ? { [field]: [message] } : {});
}

/** La fila pedida no existe (o dejó de existir entre la lectura y la escritura). */
export function notFoundError(message: string): DomainError {
  return new DomainError('not_found', message);
}

/* -------------------------------------------------------------------------- */
/* Traducción de errores de PostgreSQL                                         */
/* -------------------------------------------------------------------------- */

/** `unique_violation`: chocó un índice o restricción UNIQUE. */
const UNIQUE_VIOLATION = '23505';
/** `check_violation`: chocó una restricción CHECK. */
const CHECK_VIOLATION = '23514';
/** `foreign_key_violation`: la fila referenciada no existe o todavía tiene dependientes. */
const FOREIGN_KEY_VIOLATION = '23503';

interface ConstraintMessage {
  readonly field: string;
  readonly message: string;
}

/**
 * Restricciones del esquema (`packages/db/src/schema.ts`) que un administrador puede provocar
 * desde la interfaz académica, con su mensaje de negocio.
 */
const CONSTRAINT_MESSAGES: Readonly<Record<string, ConstraintMessage>> = {
  students_student_code_unique: {
    field: 'studentCode',
    message: 'Ya existe un estudiante con ese código estudiantil.',
  },
  subjects_code_unique: {
    field: 'code',
    message: 'Ya existe una materia con ese código.',
  },
  groups_subject_name_term_unique: {
    field: 'name',
    message: 'Ya existe un grupo con ese nombre para la misma materia y el mismo periodo.',
  },
  enrollments_group_student_unique: {
    field: 'studentId',
    message: 'El estudiante ya está inscrito en este grupo.',
  },
  schedules_weekday_range: {
    field: 'weekday',
    message: 'El día de la semana debe estar entre 1 (lunes) y 7 (domingo).',
  },
  schedules_time_order: {
    field: 'endTime',
    message: 'La hora de fin debe ser posterior a la hora de inicio.',
  },
  schedules_group_id_groups_id_fk: {
    field: 'groupId',
    message: 'El grupo indicado no existe.',
  },
  enrollments_group_id_groups_id_fk: {
    field: 'groupId',
    message: 'El grupo indicado no existe.',
  },
  enrollments_student_id_students_id_fk: {
    field: 'studentId',
    message: 'El estudiante indicado no existe.',
  },
  groups_subject_id_subjects_id_fk: {
    field: 'subjectId',
    message: 'La materia indicada no existe.',
  },
  groups_teacher_id_users_id_fk: {
    field: 'teacherId',
    message: 'El profesor indicado no existe.',
  },
};

/** Códigos de PostgreSQL que este módulo sabe traducir a un mensaje de negocio. */
const TRANSLATABLE_CODES = new Set([UNIQUE_VIOLATION, CHECK_VIOLATION, FOREIGN_KEY_VIOLATION]);

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Extrae `code` y nombre de restricción de un error de postgres.js.
 *
 * Drizzle envuelve el error del driver en un `DrizzleQueryError` y deja el original en `cause`, así
 * que hay que recorrer la cadena. El nombre de la restricción viaja en `constraint_name`, pero
 * algunos errores solo lo traen dentro del mensaje; por eso, si falta, se busca en el texto.
 */
function readPostgresFailure(error: unknown): { code: string; constraint?: string } | undefined {
  // Tope defensivo: una cadena de `cause` cíclica no debe colgar el proceso.
  for (let current = error, depth = 0; depth < 8; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;

    const source = current as Record<string, unknown>;
    const code = readString(source, 'code');

    if (code && TRANSLATABLE_CODES.has(code)) {
      const constraint =
        readString(source, 'constraint_name') ??
        Object.keys(CONSTRAINT_MESSAGES).find((name) =>
          (readString(source, 'message') ?? '').includes(name),
        );

      return constraint === undefined ? { code } : { code, constraint };
    }

    current = source['cause'];
  }

  return undefined;
}

/**
 * Traduce un error de PostgreSQL a un {@link DomainError} con mensaje en español.
 *
 * Devuelve el error original sin tocar si no lo reconoce: un fallo de infraestructura debe seguir
 * subiendo como fallo de infraestructura, no disfrazado de error de negocio.
 */
export function translateDatabaseError(error: unknown): unknown {
  const failure = readPostgresFailure(error);
  if (!failure) return error;

  const known = failure.constraint ? CONSTRAINT_MESSAGES[failure.constraint] : undefined;
  if (!known) return error;

  return failure.code === UNIQUE_VIOLATION
    ? conflictError(known.message, known.field)
    : validationError(known.message, { [known.field]: [known.message] });
}

/** Ejecuta una operación contra la base traduciendo sus violaciones de restricción. */
export async function withTranslatedErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw translateDatabaseError(error);
  }
}
