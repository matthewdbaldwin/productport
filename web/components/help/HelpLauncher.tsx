'use client';

// web/components/help/HelpLauncher.tsx
// The Help Library's in-app entry point: the shared HelpDropdown (live search
// over the same corpus /help uses, with a "View full Help Library" link),
// mounted in the catalog top bar's chrome group (app/page.tsx) next to the
// app switcher and the profile button — ProductPort's whole authenticated UI
// is that one page, so the bar is present across all six logical views.
//
// onSelect: articles go to /help/<slug>; a popover result goes to its
// targetHref and NOWHERE when it has none (a bare `/help/${slug}` push for a
// popover doc would 404 — the HubPort bug the 08-11 EngagePort review caught).
// onSettledQuery: a settled query with zero literal hits is a HelpSearchMiss;
// wasFuzzyRescued records whether the fuzzy fallback found anything.
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { HelpDropdown } from '@matthewdbaldwin/microport-ui/help';
import type { HelpSearchDoc, HelpSearchResult } from '@matthewdbaldwin/microport-ui/help/logic';
import { useAuth } from '@/contexts/AuthContext';
import { buildSearchDocs } from '@/lib/help/searchDocs';
import { recordHelpSearchMiss } from '@/lib/help/searchMiss';
import { DEFAULT_LOCALE } from '@/lib/locales';

type GateUser = { role?: string; isSuperuser?: boolean } | null | undefined;

// Dynamic import keeps fuse.js out of the catalog bundle until a query misses.
async function fuzzySearch(query: string, docs: HelpSearchDoc[], user: GateUser) {
  const { searchHelpFuzzy } = await import('@matthewdbaldwin/microport-ui/help/fuzzy');
  return searchHelpFuzzy(query, docs, user);
}

export function HelpLauncher() {
  const { user } = useAuth();
  const router = useRouter();
  const locale = user?.locale ?? DEFAULT_LOCALE;
  const docs = useMemo(() => buildSearchDocs(locale), [locale]);

  if (!user) return null;

  const onSelect = (result: HelpSearchResult) => {
    if (result.kind === 'popover') {
      if (result.targetHref) router.push(result.targetHref);
      return;
    }
    router.push(`/help/${result.slug}`);
  };

  return (
    <HelpDropdown
      docs={docs}
      user={user}
      onSelect={onSelect}
      fuzzySearch={fuzzySearch}
      onSettledQuery={({ query, literalCount, fuzzyCount }) => {
        if (literalCount === 0) recordHelpSearchMiss({ query, wasFuzzyRescued: (fuzzyCount ?? 0) > 0, locale });
      }}
    />
  );
}
