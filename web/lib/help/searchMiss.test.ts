// web/lib/help/searchMiss.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted so the mock exists before vi.mock's hoisted factory runs — the
// same pattern contexts/AuthContext.test.tsx uses for @/lib/api.
const h = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: h.api }));
const apiMock = h.api;

import { recordHelpSearchMiss } from './searchMiss';

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ id: 1 });
});

describe('recordHelpSearchMiss', () => {
  it('POSTs to /api/help with the query, fuzzy flag, and locale', () => {
    recordHelpSearchMiss({ query: 'export', wasFuzzyRescued: true, locale: 'en-US' });
    expect(apiMock).toHaveBeenCalledWith('/api/help', {
      method: 'POST',
      body: JSON.stringify({ query: 'export', wasFuzzyRescued: true, locale: 'en-US' }),
    });
  });

  it('never throws when the write fails — fire-and-forget', async () => {
    apiMock.mockRejectedValueOnce(new Error('network down'));
    expect(() => recordHelpSearchMiss({ query: 'x', wasFuzzyRescued: false })).not.toThrow();
    // Let the rejected promise settle so an unhandled rejection would surface here.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('never throws when api itself throws synchronously', () => {
    apiMock.mockImplementationOnce(() => { throw new Error('fetch unavailable'); });
    expect(() => recordHelpSearchMiss({ query: 'x', wasFuzzyRescued: false })).not.toThrow();
  });
});
