'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { startLivePolling } from '../_lib/polling';

const POLL_MS = 4000;

/** Refresca la vista de sesión sin recarga manual (≤ 5 s). */
export function LivePoller() {
  const router = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return startLivePolling(() => {
      router.refresh();
      setTick((value) => value + 1);
    }, POLL_MS);
  }, [router]);

  return (
    <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
      Actualización automática cada {POLL_MS / 1000} s{tick > 0 ? ` · refrescos: ${tick}` : null}
    </p>
  );
}
