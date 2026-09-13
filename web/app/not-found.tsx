'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NotFoundPage } from '@matthewdbaldwin/microport-ui';

// productport has no app shell / separate dashboard route — the catalog page
// at `/` IS the whole authenticated app, so both the primary and secondary
// links point there.
export default function NotFound() {
  const t = useTranslations('errors');
  return (
    <NotFoundPage
      linkComponent={Link}
      primaryHref="/"
      primaryLabel={t('notFoundCtaDashboard')}
      secondaryHref="/"
      secondaryLabel={t('notFoundCtaHome')}
      title={t('notFoundTitle')}
      description={t('notFoundDescription')}
    />
  );
}
