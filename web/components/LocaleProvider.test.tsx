// LocaleProvider is a CLIENT component that hands NextIntlClientProvider
// explicit props. A client-rendered provider does NOT inherit timeZone from
// i18n.ts (only a provider rendered directly in a Server Component does), so
// setting timeZone in the request config alone left every SSR'd formatter on
// the host zone — the `Error: ENVIRONMENT_FALLBACK` line in prod at
// /ecs/productport-web. The layout must pass the zone through, and this
// provider must forward it.
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { useFormatter, useTimeZone } from 'next-intl';
import { LocaleProvider } from './LocaleProvider';

function Probe() {
  const tz = useTimeZone();
  const format = useFormatter();
  // 23:30Z — an instant whose hour differs in almost any non-UTC host zone.
  const hour = format.dateTime(new Date('2026-01-01T23:30:00Z'), { hour: 'numeric', hour12: false });
  return <div data-testid="probe">{`${tz ?? 'none'}|${hour}`}</div>;
}

describe('LocaleProvider', () => {
  test('forwards timeZone to the client provider so formatters never fall back to the host zone', () => {
    render(
      <LocaleProvider locale="en-US" messages={{}} timeZone="UTC">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('UTC|23');
  });
});
