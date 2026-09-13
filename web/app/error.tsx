'use client';

import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { ErrorPage } from '@matthewdbaldwin/microport-ui';

// productport has no route groups / app shell — this sits directly at
// app/error.tsx (there is no authenticated segment to nest it in), and
// "back to dashboard" points at `/`, the catalog page that IS the app.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <ErrorPage
      error={error}
      reset={reset}
      linkComponent={Link}
      backHref="/"
      backLabel={t('backToDashboard')}
      title={t('inAppErrorTitle')}
      description={t('inAppErrorDescription')}
      refLabel={t('errorRef')}
      tryAgainLabel={t('tryAgain')}
      onError={(err) => Sentry.captureException(err)}
    />
  );
}
