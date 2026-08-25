import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tripsLoop, clearLoop, loopVerdict, LOOP_MAX, LOOP_WINDOW_MS } from './ssoLoopGuard';

const KEY = 'productport_sso_attempts';

/** A working in-memory sessionStorage. */
function workingStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
  } as Storage;
}

/**
 * Safari with "Block all cookies": touching sessionStorage throws SecurityError.
 * This is THE input that must make the brake trip — the whole point of the fix.
 */
function throwingStorage(): Storage {
  const boom = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  return {
    get length(): number { return boom(); },
    key: boom, getItem: boom, setItem: boom, removeItem: boom, clear: boom,
  } as unknown as Storage;
}

/** Storage that reads fine but refuses writes (quota exhausted / partial block). */
function readOnlyStorage(): Storage {
  const base = workingStorage();
  return {
    ...base,
    getItem: (k: string) => base.getItem(k),
    setItem: () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); },
    removeItem: (k: string) => base.removeItem(k),
  } as unknown as Storage;
}

function install(s: Storage) {
  Object.defineProperty(window, 'sessionStorage', { value: s, configurable: true, writable: true });
}

let original: Storage;
beforeEach(() => { original = window.sessionStorage; });
afterEach(() => { install(original); });

describe('tripsLoop — normal storage', () => {
  beforeEach(() => install(workingStorage()));

  it('allows the first LOOP_MAX redirects and trips on the next one', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < LOOP_MAX; i++) {
      expect(tripsLoop(KEY, t0 + i * 100)).toBe(false);
    }
    expect(tripsLoop(KEY, t0 + LOOP_MAX * 100)).toBe(true);
  });

  it('ignores attempts older than the window, so a slow retry never trips', () => {
    const t0 = 1_000_000;
    tripsLoop(KEY, t0);
    tripsLoop(KEY, t0 + LOOP_WINDOW_MS + 1);
    // Both prior attempts are outside a window ending here, except the second.
    expect(tripsLoop(KEY, t0 + LOOP_WINDOW_MS + 2)).toBe(false);
  });

  it('clearLoop resets the counter so "Try again" re-enters SSO once', () => {
    const t0 = 1_000_000;
    for (let i = 0; i <= LOOP_MAX; i++) tripsLoop(KEY, t0 + i);
    clearLoop(KEY);
    expect(tripsLoop(KEY, t0 + 10)).toBe(false);
  });

  it('self-heals corrupt stored JSON instead of dead-ending forever', () => {
    window.sessionStorage.setItem(KEY, '{not json');
    expect(tripsLoop(KEY, 1_000_000)).toBe(false);
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!)).toEqual([1_000_000]);
  });

  it('ignores non-numeric entries in a well-formed array', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify(['x', null, {}]));
    expect(tripsLoop(KEY, 1_000_000)).toBe(false);
  });
});

describe('tripsLoop — storage unavailable (the Safari login-loop case)', () => {
  it('FAILS CLOSED when sessionStorage access throws', () => {
    install(throwingStorage());
    // The pre-fix implementation returned false here, which disabled the brake
    // and let /login auto-redirect to SSO forever on Safari.
    expect(tripsLoop(KEY, 1_000_000)).toBe(true);
  });

  it('FAILS CLOSED when the write is refused but reads succeed', () => {
    install(readOnlyStorage());
    expect(tripsLoop(KEY, 1_000_000)).toBe(true);
  });

  it('trips on EVERY call, so a repeated bounce can never slip through', () => {
    install(throwingStorage());
    for (let i = 0; i < 5; i++) expect(tripsLoop(KEY, 1_000_000 + i)).toBe(true);
  });

  it('clearLoop swallows the throw so the manual button still renders', () => {
    install(throwingStorage());
    expect(() => clearLoop(KEY)).not.toThrow();
  });
});

describe('loopVerdict — distinguishes WHY the brake tripped', () => {
  // The dead-end screen's remediation differs by cause: a counted loop means
  // "the SSO round-trip keeps failing" (generic retry/contact-admin copy),
  // while blocked storage means the browser is refusing cookies/site data
  // (Safari "Block all cookies") and the user can self-serve by changing a
  // setting. tripsLoop() collapses both to `true`; loopVerdict() keeps them
  // apart so the login page can show the right message.
  it('returns ok, then loop, as attempts accumulate in working storage', () => {
    install(workingStorage());
    const t0 = 1_000_000;
    for (let i = 0; i < LOOP_MAX; i++) {
      expect(loopVerdict(KEY, t0 + i * 100)).toBe('ok');
    }
    expect(loopVerdict(KEY, t0 + LOOP_MAX * 100)).toBe('loop');
  });

  it('returns storage when sessionStorage access throws (Safari "Block all cookies")', () => {
    install(throwingStorage());
    expect(loopVerdict(KEY, 1_000_000)).toBe('storage');
  });

  it('returns storage when reads work but the write is refused', () => {
    install(readOnlyStorage());
    expect(loopVerdict(KEY, 1_000_000)).toBe('storage');
  });

  it('agrees with tripsLoop call-for-call (two keys advanced identically)', () => {
    install(workingStorage());
    const t0 = 2_000_000;
    for (let i = 0; i <= LOOP_MAX + 2; i++) {
      const verdict = loopVerdict(KEY, t0 + i * 100);
      const tripped = tripsLoop(`${KEY}_twin`, t0 + i * 100);
      expect(verdict !== 'ok').toBe(tripped);
    }
  });

  it('clearLoop resets the verdict back to ok', () => {
    install(workingStorage());
    const t0 = 3_000_000;
    for (let i = 0; i <= LOOP_MAX; i++) loopVerdict(KEY, t0 + i);
    clearLoop(KEY);
    expect(loopVerdict(KEY, t0 + 10)).toBe('ok');
  });
});
