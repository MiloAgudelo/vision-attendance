import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ADMIN_PAGES = [
  './admin/page.tsx',
  './devices/page.tsx',
  './devices/enrollment/page.tsx',
  './groups/page.tsx',
  './groups/[id]/page.tsx',
  './schedules/page.tsx',
  './students/page.tsx',
  './students/[id]/page.tsx',
  './subjects/page.tsx',
  './subjects/[id]/page.tsx',
] as const;

describe('autorización de lecturas administrativas', () => {
  it.each(ADMIN_PAGES)('%s reautoriza antes de consultar datos', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const guardIndex = source.indexOf("await requireRole('admin')");
    const queryIndexes = [...source.matchAll(/await (?:Promise\.all|list[A-Z]|get[A-Z])/g)].map(
      (match) => match.index,
    );

    expect(source).toContain("import { requireRole } from '@/app/_lib/auth/guards'");
    expect(guardIndex).toBeGreaterThan(0);
    expect(queryIndexes.length).toBeGreaterThan(0);
    expect(guardIndex).toBeLessThan(Math.min(...queryIndexes));
  });
});
