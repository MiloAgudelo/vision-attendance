import { NextResponse } from 'next/server';

import { checkHealth } from '@/server/health';

/** Consulta la base en cada petición: nunca se cachea ni se prerenderiza. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `GET /api/health` — comprueba que el servicio y su base de datos responden.
 *
 * 200 `{ ok: true, db: "up" }` · 503 `{ ok: false, db: "down" }`.
 */
export async function GET() {
  const status = await checkHealth();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
