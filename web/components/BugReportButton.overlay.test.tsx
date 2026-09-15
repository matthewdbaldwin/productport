// web/components/BugReportButton.overlay.test.tsx
// Replaces web/e2e/overlay-token.spec.ts, which no CI Playwright project ever
// collected (productport#27, decision A2). Guards the failure mode where the
// overlay token is CONSUMED but never DEFINED, so a modal scrim paints fully
// transparent.
//
// Since microport-ui 0.60 the bug-report modal is the lib's `BugReportLauncher`
// and its scrim is the lib Dialog's own `bg-black/60` — no app token involved.
// `var(--overlay)` is still consumed inline by microport-ui's help overlay, so
// the token chain is still worth pinning; what the first case guards now is the
// adoption wiring itself (the preserved `bug-report-launcher` testId opens a
// real dialog). jsdom runs no Tailwind/PostCSS, so the rest is pinned link by
// link:
//   1. globals.css maps the bg-overlay utility's --color-overlay onto
//      var(--overlay), with no local fallback;
//   2. the installed themes.css actually assigns --overlay a non-empty value.
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
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { BugReportButton } from './BugReportButton';

const WEB = path.resolve(__dirname, '..');

describe('bug-report modal scrim', () => {
  it('the preserved launcher testId opens the lib dialog with a painted scrim', () => {
    render(
      <NextIntlClientProvider locale="en-US" messages={en}>
        <BugReportButton />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId('bug-report-launcher'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    const scrims = Array.from(document.body.querySelectorAll<HTMLElement>('.fixed.inset-0'))
      .filter((el) => !el.querySelector('[role="dialog"]'));
    expect(scrims).toHaveLength(1);
    // A concrete colour, not a token the app might have failed to define.
    expect(scrims[0].className).toMatch(/bg-black\/\d+/);
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
    expect(m, '--overlay is consumed by the help overlay but never assigned').not.toBeNull();
    expect(m![1].trim()).not.toBe('');
    expect(m![1].trim()).not.toMatch(/^(transparent|rgba\([^)]*,\s*0\))$/);
  });
});
