// web/components/BugReportButton.overlay.test.tsx
// Replaces web/e2e/overlay-token.spec.ts, which no CI Playwright project ever
// collected (productport#27, decision A2). Guards the failure mode where the
// overlay token is CONSUMED but never DEFINED, so a modal scrim paints fully
// transparent.
//
// jsdom runs no Tailwind/PostCSS, so the chain is pinned link by link:
//   1. the bug-report modal's backdrop (ProductPort's one local modal backdrop)
//      renders with the `bg-overlay` utility, not a hardcoded rgba/bg-black;
//   2. globals.css maps that utility's --color-overlay onto var(--overlay) and
//      imports microport-ui's themes.css, with no local fallback;
//   3. the installed themes.css actually assigns --overlay a non-empty value.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'viewer', email: 'v@microport.com', name: null, locale: 'en-US' }, loading: false }),
}));
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
// Keep the echarts/canvas ESM bundle out of jsdom (same stub set ProfileModal.test.tsx uses).
vi.mock('@matthewdbaldwin/microport-ui', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  useModalEsc: () => {},
  useFocusTrap: () => ({ current: null }),
  optimizeImageForUpload: async (f: File) => f,
  useConfirm: () => ({ confirm: async () => true, confirmDialog: null }),
}));

import { BugReportButton } from './BugReportButton';

const WEB = path.resolve(__dirname, '..');

describe('modal backdrop uses the --overlay token', () => {
  it('the bug-report modal backdrop renders with bg-overlay', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <BugReportButton />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId('bug-report-launcher'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    const backdrops = Array.from(document.body.querySelectorAll<HTMLElement>('.fixed.inset-0'))
      .filter((el) => !el.querySelector('[role="dialog"]'));
    expect(backdrops).toHaveLength(1);
    expect(backdrops[0].classList.contains('bg-overlay')).toBe(true);
    expect(backdrops[0].className).not.toMatch(/bg-black|rgba\(/);
  });

  it('globals.css wires the utility to var(--overlay) and imports the theme tokens', () => {
    const css = readFileSync(path.join(WEB, 'app/globals.css'), 'utf8');
    expect(css).toMatch(/@import\s+['"]@matthewdbaldwin\/microport-ui\/themes\.css['"]/);
    expect(css).toMatch(/--color-overlay:\s*var\(--overlay\);/);
    // No dead local fallback that would mask a missing token.
    expect(css).not.toMatch(/var\(--overlay\s*,/);
  });

  it('microport-ui themes.css assigns --overlay a painted value', () => {
    const require = createRequire(path.join(WEB, 'package.json'));
    const themes = readFileSync(require.resolve('@matthewdbaldwin/microport-ui/themes.css'), 'utf8');
    const m = themes.match(/--overlay:\s*([^;]+);/);
    expect(m, '--overlay is consumed by bg-overlay but never assigned').not.toBeNull();
    expect(m![1].trim()).not.toBe('');
    expect(m![1].trim()).not.toMatch(/^(transparent|rgba\([^)]*,\s*0\))$/);
  });
});
