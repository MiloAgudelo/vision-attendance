import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_ATTEMPTS, DEFAULT_TIMEOUT_MS } from '../client.js';
import { RETRY_DEMO_TIMEOUT_MS, parseArgs, type CliOptions } from './args.js';

const KEY = 'vad_LAB-DESARROLLO-01_s3cr3to-de-alta-entropia';

/** Analiza y exige que el resultado sean opciones válidas. */
function options(argv: string[], env: Record<string, string> = {}): CliOptions {
  const parsed = parseArgs(argv, env);
  if (parsed.kind !== 'options') {
    throw new Error(
      `Se esperaban opciones y se obtuvo ${parsed.kind}: ${'message' in parsed ? parsed.message : ''}`,
    );
  }
  return parsed.options;
}

/** Analiza y exige un error de uso; devuelve el mensaje. */
function usageError(argv: string[], env: Record<string, string> = {}): string {
  const parsed = parseArgs(argv, env);
  if (parsed.kind !== 'usage-error') {
    throw new Error(`Se esperaba un error de uso y se obtuvo ${parsed.kind}`);
  }
  return parsed.message;
}

describe('ayuda', () => {
  it('sin argumentos muestra la ayuda general', () => {
    expect(parseArgs([])).toEqual({ kind: 'help', topic: null });
  });

  it('--help sin comando muestra la ayuda general', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help', topic: null });
  });

  it('--help tras un comando muestra la ayuda de ese comando', () => {
    expect(parseArgs(['rafaga', '--help'])).toEqual({ kind: 'help', topic: 'rafaga' });
  });
});

describe('errores de uso', () => {
  it('rechaza un comando desconocido', () => {
    expect(usageError(['volar', '--key', KEY])).toContain('Comando desconocido');
  });

  it('rechaza una opción desconocida', () => {
    expect(usageError(['enviar', '--turbo'])).toContain('Opción desconocida');
  });

  it('rechaza una opción sin valor', () => {
    expect(usageError(['enviar', '--uid'])).toContain('necesita un valor');
  });

  it('exige la credencial', () => {
    expect(usageError(['enviar', '--uid', 'A1B2C3D4'])).toContain('Falta la credencial');
  });

  it('rechaza una credencial con forma inválida', () => {
    expect(usageError(['enviar', '--uid', 'A1B2C3D4', '--key', 'token'])).toContain(
      'vad_<nombre-del-dispositivo>_<secreto>',
    );
  });

  it('exige --uid en los comandos que prueban un carnet concreto', () => {
    expect(usageError(['enviar', '--key', KEY])).toContain('--uid');
    expect(usageError(['repetir', '--key', KEY])).toContain('--uid');
  });

  it('rechaza --uid en la ráfaga, que genera uno por lectura', () => {
    expect(usageError(['rafaga', '--key', KEY, '--uid', 'A1B2C3D4'])).toContain(
      'no admite "--uid"',
    );
  });

  it('rechaza combinar --scanned-at con --scanned-at-offset', () => {
    expect(
      usageError([
        'enviar',
        '--key',
        KEY,
        '--uid',
        'A1B2C3D4',
        '--scanned-at',
        'null',
        '--scanned-at-offset',
        '-3h',
      ]),
    ).toContain('excluyentes');
  });

  it('rechaza duraciones inválidas', () => {
    expect(
      usageError(['enviar', '--key', KEY, '--uid', 'A1B2C3D4', '--scanned-at-offset', '3x']),
    ).toContain('Duración inválida');
  });

  it('rechaza un --expect que no es un result del contrato', () => {
    expect(usageError(['enviar', '--key', KEY, '--uid', 'A1B2C3D4', '--expect', 'ok'])).toContain(
      'no reconocido',
    );
  });

  it('rechaza --count no positivo', () => {
    expect(usageError(['repetir', '--key', KEY, '--uid', 'A1B2C3D4', '--count', '0'])).toContain(
      'entero positivo',
    );
  });

  it('rechaza --count en comandos de una sola lectura', () => {
    expect(usageError(['enviar', '--key', KEY, '--uid', 'A1B2C3D4', '--count', '3'])).toContain(
      'una sola lectura',
    );
  });

  it('rechaza --bytes distinto de 4 o 7', () => {
    expect(usageError(['rafaga', '--key', KEY, '--bytes', '10'])).toContain('solo admite 4 o 7');
  });

  it('rechaza opciones repetidas', () => {
    expect(
      usageError(['enviar', '--key', KEY, '--uid', 'A1B2C3D4', '--uid', 'B1B2C3D4']),
    ).toContain('repetida');
  });

  it('rechaza dos comandos', () => {
    expect(usageError(['enviar', 'repetir', '--key', KEY])).toContain('Sobra el argumento');
  });
});

describe('valores por defecto', () => {
  it('usa localhost:3000, 5 intentos y el tiempo límite del contrato', () => {
    const parsed = options(['enviar', '--key', KEY, '--uid', 'A1B2C3D4']);
    expect(parsed.baseUrl).toBe('http://localhost:3000');
    expect(parsed.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(parsed.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(parsed.initialBackoffMs).toBe(1000);
    expect(parsed.deviceId).toBeUndefined();
    expect(parsed.json).toBe(false);
  });

  it('el comando reintentar acorta el tiempo límite para provocar el backoff', () => {
    expect(options(['reintentar', '--key', KEY, '--uid', 'A1B2C3D4']).timeoutMs).toBe(
      RETRY_DEMO_TIMEOUT_MS,
    );
  });

  it('repetir envía 3 lecturas y rafaga 5 con 500 ms de retardo', () => {
    expect(options(['repetir', '--key', KEY, '--uid', 'A1B2C3D4']).count).toBe(3);
    const burst = options(['rafaga', '--key', KEY]);
    expect(burst.count).toBe(5);
    expect(burst.delayMs).toBe(500);
  });

  it('toma la URL, el dispositivo y la credencial del entorno', () => {
    const parsed = options(['enviar', '--uid', 'A1B2C3D4'], {
      SIM_URL: 'http://192.168.1.20:3000',
      SIM_DEVICE: 'OTRO-LECTOR',
      SIM_KEY: KEY,
    });
    expect(parsed.baseUrl).toBe('http://192.168.1.20:3000');
    expect(parsed.deviceId).toBe('OTRO-LECTOR');
    expect(parsed.apiKey).toBe(KEY);
  });

  it('las opciones explícitas ganan al entorno', () => {
    const parsed = options(['enviar', '--uid', 'A1B2C3D4', '--url', 'http://otro:4000'], {
      SIM_URL: 'http://192.168.1.20:3000',
      SIM_KEY: KEY,
    });
    expect(parsed.baseUrl).toBe('http://otro:4000');
  });
});

describe('opciones de la lectura', () => {
  it('acepta la forma --opcion=valor', () => {
    const parsed = options(['enviar', `--key=${KEY}`, '--uid=a1:b2:c3:d4', '--json']);
    expect(parsed.cardUid).toBe('a1:b2:c3:d4');
    expect(parsed.json).toBe(true);
  });

  it('traduce --scanned-at null al null del contrato', () => {
    expect(
      options(['enviar', '--key', KEY, '--uid', 'A1B2C3D4', '--scanned-at', 'null']).scannedAt,
    ).toBeNull();
  });

  it('conserva un --scanned-at explícito', () => {
    expect(
      options([
        'enviar',
        '--key',
        KEY,
        '--uid',
        'A1B2C3D4',
        '--scanned-at',
        '2026-08-10T13:05:12-05:00',
      ]).scannedAt,
    ).toBe('2026-08-10T13:05:12-05:00');
  });

  it('convierte --scanned-at-offset a milisegundos', () => {
    expect(
      options(['enviar', '--key', KEY, '--uid', 'A1B2C3D4', '--scanned-at-offset', '-3h'])
        .scannedAtOffsetMs,
    ).toBe(-10_800_000);
  });

  it('traduce --firmware-version null a null', () => {
    expect(
      options(['enviar', '--key', KEY, '--uid', 'A1B2C3D4', '--firmware-version', 'null'])
        .firmwareVersion,
    ).toBeNull();
  });

  it('admite varios valores en --expect', () => {
    expect(
      options([
        'enviar',
        '--key',
        KEY,
        '--uid',
        'A1B2C3D4',
        '--expect',
        'registered,already_registered',
      ]).expect,
    ).toEqual(['registered', 'already_registered']);
  });

  it('ignora un "--" suelto, que algunos gestores de paquetes reenvían', () => {
    expect(options(['--', 'enviar', '--key', KEY, '--uid', 'A1B2C3D4']).command).toBe('enviar');
  });
});
