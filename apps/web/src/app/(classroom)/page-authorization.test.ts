import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const CLASSROOM_PAGES = [
  './sessions/page.tsx',
  './sessions/[id]/page.tsx',
  './students/[id]/attendance/page.tsx',
] as const;

describe('autorización del tablero de aula', () => {
  it.each(CLASSROOM_PAGES)('%s exige usuario autenticado antes de consultar', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const guardIndex = source.indexOf('await requireAuthenticatedUser()');
    const queryIndexes = [
      ...source.matchAll(/await (?:loadAccessible|listAccessible|listSession)/g),
    ].map((match) => match.index);

    expect(source).toContain("import { requireAuthenticatedUser } from '@/app/_lib/auth/guards'");
    expect(guardIndex).toBeGreaterThan(0);
    expect(queryIndexes.length).toBeGreaterThan(0);
    expect(guardIndex).toBeLessThan(Math.min(...queryIndexes));
  });

  it('el layout del aula rechaza al anónimo', () => {
    const source = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8');
    expect(source).toContain('await requireAuthenticatedUser()');
  });
});
