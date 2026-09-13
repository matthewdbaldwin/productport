'use client';

import * as Sentry from '@sentry/nextjs';
import { GlobalErrorPage } from '@matthewdbaldwin/microport-ui';

// No i18n provider is mounted this high (it lives in the root layout, which
// has just thrown), so this keeps the lib's English defaults.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return <GlobalErrorPage error={error} onError={(err) => Sentry.captureException(err)} />;
}
