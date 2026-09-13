'use client';

// web/components/layout/AppCommandPalette.tsx
// The app-wide ⌘K / Ctrl-K palette (microport-ui CommandPalette), mounted once
// in the root layout so it works on the catalog and across /help. Renders
// nothing without a signed-in user, so /login and the guest /help/login shell
// get no palette.
//
// Groups: "Go to" reuses the two destinations the app already links to (the
// catalog at `/` and the Help Library at `/help`, with the /help header's
// labels), then the help library via helpCommandGroup over the same corpus
// HelpLauncher and the /help index search. A help result routes exactly like
// HelpLauncher: articles go to /help/<slug>; a popover result goes to its
// targetHref and nowhere when it has none (/help/<slug> would 404).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpen, LayoutGrid } from 'lucide-react';
import { CommandPalette } from '@matthewdbaldwin/microport-ui';
import { helpCommandGroup } from '@matthewdbaldwin/microport-ui/help';
import type { HelpSearchResult } from '@matthewdbaldwin/microport-ui/help/logic';
import { useAuth } from '@/contexts/AuthContext';
import { useHelpLocale } from '@/lib/help/useHelpLocale';
import { buildSearchDocs } from '@/lib/help/searchDocs';

export function AppCommandPalette() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations('palette');
  const tHelp = useTranslations('help');
  const [query, setQuery] = useState('');
  const locale = useHelpLocale();
  const docs = useMemo(() => buildSearchDocs(locale), [locale]);

  if (!user) return null;

  const openHelpResult = (result: HelpSearchResult) => {
    if (result.kind === 'popover') {
      if (result.targetHref) router.push(result.targetHref);
      return;
    }
    router.push(`/help/${result.slug}`);
  };

  return (
    <CommandPalette
      label={t('label')}
      placeholder={t('placeholder')}
      emptyText={t('empty')}
      onQueryChange={setQuery}
      groups={[
        {
          id: 'nav',
          heading: t('goTo'),
          items: [
            { id: 'nav:catalog', label: tHelp('backToApp'), keywords: ['catalog', '/'], icon: <LayoutGrid size={16} />, onSelect: () => router.push('/') },
            { id: 'nav:help', label: tHelp('libraryTitle'), keywords: ['help', '/help'], icon: <BookOpen size={16} />, onSelect: () => router.push('/help') },
          ],
        },
        helpCommandGroup({ query, docs, user, onSelect: openHelpResult, heading: tHelp('helpLabel') }),
      ]}
    />
  );
}
