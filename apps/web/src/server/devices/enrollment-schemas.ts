/** Validación (Zod) de la asociación de un carnet capturado a un estudiante. */

import { z } from 'zod';

export const assignCardInputSchema = z.object({
  cardId: z.uuid('Carnet inválido'),
  studentId: z.uuid('Estudiante inválido'),
});
export type AssignCardInput = z.infer<typeof assignCardInputSchema>;
