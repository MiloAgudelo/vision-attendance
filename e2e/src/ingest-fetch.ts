/**
 * Puente HTTP inyectable para {@link DeviceSimulator}: convierte cada `fetch` del
 * simulador en una llamada al pipeline real `ingestDeviceEvent` (sin levantar Next).
 */

import type { Database } from '@va/db';
import type { FetchLike } from '@va/simulator';

import { ingestDeviceEvent } from '@/server/events/ingest';

export function createIngestFetch(options: { database: Database; now: () => Date }): FetchLike {
  return async (_url, init) => {
    const headers = new Headers(init.headers);
    const authorization = headers.get('authorization');
    let body: unknown;
    if (typeof init.body === 'string') {
      body = JSON.parse(init.body) as unknown;
    } else if (init.body == null) {
      body = undefined;
    } else {
      body = JSON.parse(Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'));
    }

    const result = await ingestDeviceEvent({
      authorization,
      body,
      database: options.database,
      now: options.now,
    });

    return Response.json(result.body, { status: result.status });
  };
}
