import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HELP_SECTIONS, HELP_SLUGS, lookupHelpItem, canSeeHelpItem, visibleSectionsFor } from './sections';

const WEB = path.resolve(__dirname, '../..');

describe('HELP_SECTIONS registry', () => {
  it('registers exactly the 6 logical views from the PRD, all live (no wave-splitting)', () => {
    expect(HELP_SLUGS.size).toBe(6);
    const liveSlugs = HELP_SECTIONS.flatMap(s => s.items).filter(i => i.status === 'live').map(i => i.slug);
    expect(liveSlugs).toHaveLength(6);
  });

  it('every declared component file exists on disk', () => {
    const missing: string[] = [];
    for (const section of HELP_SECTIONS) {
      for (const item of section.items) {
        for (const comp of item.components) {
          if (!fs.existsSync(path.join(WEB, comp))) missing.push(`${item.slug}: ${comp}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('gates product-edit against a plain viewer', () => {
    const entry = lookupHelpItem('product-edit')!;
    expect(canSeeHelpItem({ role: 'viewer' }, entry.item)).toBe(false);
    expect(canSeeHelpItem({ role: 'product_admin' }, entry.item)).toBe(true);
    expect(canSeeHelpItem({ role: 'superuser', isSuperuser: true }, entry.item)).toBe(true);
  });

  it('leaves catalog-browse and product-detail open to any signed-in viewer', () => {
    for (const slug of ['catalog-browse', 'product-detail']) {
      const entry = lookupHelpItem(slug)!;
      expect(canSeeHelpItem({ role: 'viewer' }, entry.item)).toBe(true);
      expect(entry.item.roles).toBeUndefined();
    }
  });

  it('hides csv-import from a viewer', () => {
    const entry = lookupHelpItem('csv-import')!;
    expect(canSeeHelpItem({ role: 'viewer' }, entry.item)).toBe(false);
  });

  // Mirrors app/page.tsx's isAdmin gate, which admits isSuperuser === true
  // regardless of role string; the help gate must not be stricter than the app.
  it('lets a superuser-flagged viewer see role-gated items, in both the item gate and the nav', () => {
    const entry = lookupHelpItem('product-edit')!;
    expect(canSeeHelpItem({ role: 'viewer', isSuperuser: true }, entry.item)).toBe(true);
    expect(canSeeHelpItem({ role: 'viewer', isSuperuser: false }, entry.item)).toBe(false);

    const superuserNav = visibleSectionsFor({ role: 'viewer', isSuperuser: true });
    expect(superuserNav.map(s => s.id)).toContain('admin');
    expect(superuserNav.flatMap(s => s.items).map(i => i.slug)).toContain('product-edit');
    // The nav hands back the registry's own items, roles intact.
    expect(superuserNav.find(s => s.id === 'admin')!.items[0].roles).toEqual(['product_admin', 'superuser']);

    expect(visibleSectionsFor({ role: 'viewer' }).map(s => s.id)).not.toContain('admin');
    expect(visibleSectionsFor(null)).toEqual([]);
  });
});
