// Confirms microport-ui 0.39.1's Help Library subpaths resolve after the
// dependency bump — a pure import-resolution smoke test. If this fails after
// the bump, package-lock.json wasn't actually regenerated against 0.39.1.
import { describe, it, expect } from 'vitest';
import { HelpDropdown, HelpCommandPalette, HelpButton, createHelpArticleClient } from '@matthewdbaldwin/microport-ui/help';
import { canSee, visibleLiveSectionsFor, searchHelp } from '@matthewdbaldwin/microport-ui/help/logic';
import { searchHelpFuzzy } from '@matthewdbaldwin/microport-ui/help/fuzzy';

describe('microport-ui 0.39.1 help subpath resolution', () => {
  it('resolves every symbol this plan depends on', () => {
    expect(typeof HelpDropdown).toBe('function');
    expect(typeof HelpCommandPalette).toBe('function');
    expect(typeof HelpButton).toBe('function');
    expect(typeof createHelpArticleClient).toBe('function');
    expect(typeof canSee).toBe('function');
    expect(typeof visibleLiveSectionsFor).toBe('function');
    expect(typeof searchHelp).toBe('function');
    expect(typeof searchHelpFuzzy).toBe('function');
  });
});
