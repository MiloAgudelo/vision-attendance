/**
 * Piezas de validación compartidas por las entidades académicas.
 *
 * Todos los mensajes están en español: se muestran tal cual junto al campo del formulario.
 */

import { z } from 'zod';

import { validationError, type FieldErrors } from './errors';

/** Texto obligatorio ya recortado, con mensajes propios de cada campo. */
export function requiredText(options: {
  missing: string;
  tooLong: string;
  maxLength: number;
}): z.ZodType<string, string> {
  return z
    .string({ error: options.missing })
    .trim()
    .min(1, options.missing)
    .max(options.maxLength, options.tooLong);
}

/** Texto opcional: la cadena vacía y los espacios en blanco se guardan como `NULL`. */
export function optionalText(options: {
  tooLong: string;
  maxLength: number;
}): z.ZodType<string | null, string | null | undefined> {
  return z
    .string({ error: options.tooLong })
    .trim()
    .max(options.maxLength, options.tooLong)
    .nullish()
    .transform((value) => (value === undefined || value === '' ? null : value));
}

/** Identificador de una fila. Su mensaje es de diagnóstico: la interfaz nunca lo enseña. */
export function identifier(message: string): z.ZodType<string, string> {
  return z.uuid({ error: message });
}

/** Agrupa los problemas de Zod por campo para pintarlos junto a su `input`. */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const grouped: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    const bucket = grouped[key];
    if (bucket) bucket.push(issue.message);
    else grouped[key] = [issue.message];
  }

  return grouped;
}

/**
 * Valida una entrada con Zod y falla con un {@link DomainError} de validación.
 *
 * El mensaje general es el del primer problema encontrado, para que un formulario con un único
 * campo mal diligenciado muestre arriba exactamente el mismo texto que muestra abajo.
 */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const first = result.error.issues[0];
  throw validationError(
    first?.message ?? 'Los datos enviados no son válidos.',
    fieldErrorsFromZod(result.error),
  );
}

/** Escapa los comodines de `LIKE` para que una búsqueda por texto los trate como literales. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
