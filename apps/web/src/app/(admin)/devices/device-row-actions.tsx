'use client';

/** Acciones por dispositivo: cambio de modo y revocación, cada una con su propio estado. */

import { useActionState } from 'react';

import type { DeviceMode, DeviceStatus } from '@va/shared';

import { revokeDeviceAction, setDeviceModeAction } from './actions';
import { IDLE } from './form-state';

export interface DeviceRowActionsProps {
  deviceId: string;
  deviceName: string;
  mode: DeviceMode;
  status: DeviceStatus;
}

export function DeviceRowActions({ deviceId, deviceName, mode, status }: DeviceRowActionsProps) {
  const [modeState, changeMode, changingMode] = useActionState(setDeviceModeAction, IDLE);
  const [revokeState, revoke, revoking] = useActionState(revokeDeviceAction, IDLE);

  const revoked = status === 'revoked';
  const nextMode: DeviceMode = mode === 'enrollment' ? 'normal' : 'enrollment';
  const error =
    modeState.status === 'error'
      ? modeState.message
      : revokeState.status === 'error'
        ? revokeState.message
        : null;

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={changeMode}>
          <input type="hidden" name="deviceId" value={deviceId} />
          <input type="hidden" name="mode" value={nextMode} />
          <button
            type="submit"
            disabled={revoked || changingMode}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"
          >
            {nextMode === 'enrollment' ? 'Pasar a enrolamiento' : 'Volver a normal'}
          </button>
        </form>

        <form
          action={revoke}
          onSubmit={(event) => {
            const confirmado = window.confirm(
              `Revocar «${deviceName}» invalida su credencial para siempre. ¿Continuar?`,
            );
            if (!confirmado) event.preventDefault();
          }}
        >
          <input type="hidden" name="deviceId" value={deviceId} />
          <button
            type="submit"
            disabled={revoked || revoking}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40 dark:border-red-800 dark:text-red-400"
          >
            {revoked ? 'Revocado' : 'Revocar'}
          </button>
        </form>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
