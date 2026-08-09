import { NextResponse } from 'next/server';

import { ingestDeviceEvent } from '@/server/events/ingest';
import { deviceErrorResult } from '@/server/events/responses';

/** Cada lectura se procesa contra la base: nunca se cachea ni se prerenderiza. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `POST /api/v1/events` — ingesta de lecturas RFID (contrato v1 del dispositivo).
 *
 * El route handler solo hace de transporte: lee la cabecera y el cuerpo, y delega todo el pipeline
 * en `src/server/events/ingest.ts`, que es puro TypeScript y se prueba sin HTTP
 * (`docs/architecture.md` §3).
 */
export async function POST(request: Request) {
  // Un cuerpo que no es JSON no adelanta el error: la credencial se comprueba primero, así que un
  // lector sin credencial recibe 401 y no una pista sobre el formato esperado.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  try {
    const result = await ingestDeviceEvent({
      authorization: request.headers.get('authorization'),
      body,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // `internal_error` del contrato: fallo NO persistido, el dispositivo debe reintentar con el
    // mismo `eventId` (la transacción se deshizo, así que no quedó ninguna fila a medias).
    console.error('[events] fallo no controlado al procesar la lectura:', error);
    const failure = deviceErrorResult('internal_error');
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
