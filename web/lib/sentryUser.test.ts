// #119 — Sentry user context carries the opaque internal id and NOTHING else.
// The whole point of the module is that no personal field can reach Sentry
// (a third-party processor in another jurisdiction), so the tests inspect the
// exact object handed to Sentry.setUser, not just "was it called".
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setUserMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ setUser: (...a: unknown[]) => setUserMock(...a) }));

import { setSentryUser, clearSentryUser } from './sentryUser';

describe('sentryUser (#119)', () => {
  // Braces matter: a bare `() => mock.mockReset()` returns the mock, and vitest
  // treats a function returned from beforeEach as a per-test cleanup — it
  // would CALL the mock after each test (with whatever impl the test set).
  beforeEach(() => { setUserMock.mockReset(); });

  it('setSentryUser attaches exactly { id } with the id stringified', () => {
    setSentryUser(42);
    expect(setUserMock).toHaveBeenCalledTimes(1);
    expect(setUserMock).toHaveBeenCalledWith({ id: '42' });
  });

  it('never passes any key other than id — fails if a personal field ever appears', () => {
    setSentryUser(7);
    const arg = setUserMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg)).toEqual(['id']);
  });

  it('string ids pass through unchanged', () => {
    setSentryUser('usr_abc');
    expect(setUserMock).toHaveBeenCalledWith({ id: 'usr_abc' });
  });

  it('clearSentryUser sends null (the SDK contract for "no user")', () => {
    clearSentryUser();
    expect(setUserMock).toHaveBeenCalledTimes(1);
    expect(setUserMock).toHaveBeenCalledWith(null);
  });

  it('a missing id clears rather than attaching the string "undefined"', () => {
    setSentryUser(undefined);
    setSentryUser(null);
    expect(setUserMock).toHaveBeenCalledTimes(2);
    expect(setUserMock).toHaveBeenNthCalledWith(1, null);
    expect(setUserMock).toHaveBeenNthCalledWith(2, null);
  });

  it('a throwing SDK never propagates — Sentry must not be able to break auth', () => {
    setUserMock.mockImplementation(() => { throw new Error('sdk down'); });
    expect(() => setSentryUser(1)).not.toThrow();
    expect(() => clearSentryUser()).not.toThrow();
  });
});
