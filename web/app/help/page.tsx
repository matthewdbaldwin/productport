'use client';

// /help — index. Search-first header over the role-gated section cards
// (HELP_SECTIONS via visibleSectionsFor); typing swaps the cards for ranked
// results across the article + popover corpus (buildSearchDocs, the same one
// the top-bar HelpLauncher and the ⌘K palette search). When the literal pass
// comes back empty a de-emphasised fuzzy ("Did you mean…") fallback runs —
// the fuse.js-backed module is dynamic-imported so it stays out of every other
// chunk — and the miss is recorded (HelpSearchMiss, POST /api/help) ~600ms
// after typing settles. Chrome strings come from the `help` namespace; the
// item labels reuse each article's localized title (the registry labels are
// English-only) and the section headings come from getSectionTitle, resolved
// against the same user locale as the corpus so card heading and rows agree.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen, ChevronRight, KeyRound, LayoutGrid, Search, Settings, type LucideIcon } from 'lucide-react';
import { searchHelp, type HelpSearchResult } from '@matthewdbaldwin/microport-ui/help/logic';
import type { HelpFuzzySearchResult } from '@matthewdbaldwin/microport-ui/help/fuzzy';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOCALE } from '@/lib/locales';
import { visibleSectionsFor } from '@/lib/help/sections';
import { getSectionTitle } from '@/lib/help/sectionTitles';
import { getHelpContent } from '@/lib/help/content';
import { buildSearchDocs } from '@/lib/help/searchDocs';
import { recordHelpSearchMiss } from '@/lib/help/searchMiss';

const SECTION_ICON: Record<string, LucideIcon> = { catalog: LayoutGrid, admin: Settings, account: KeyRound };

const ROW_CLASS = 'block rounded-lg border p-4 transition-colors hover:bg-surface-2';
const ROW_STYLE = { borderColor: 'var(--border)', background: 'var(--surface)' };

function ResultRow({ r }: { r: HelpSearchResult | HelpFuzzySearchResult }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium min-w-0 truncate" style={{ color: 'var(--text)' }}>{r.title}</span>
        {r.sectionTitle && <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{r.sectionTitle}</span>}
      </div>
      {r.snippet && <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--muted2)' }}>{r.snippet}</p>}
    </>
  );
  if (r.kind === 'popover') {
    // A popover with no route to land on is searchable but not clickable.
    if (!r.targetHref) return <div className={ROW_CLASS} style={ROW_STYLE}>{body}</div>;
    return <Link href={r.targetHref} className={ROW_CLASS} style={ROW_STYLE}>{body}</Link>;
  }
  return <Link href={`/help/${r.slug}`} className={ROW_CLASS} style={ROW_STYLE}>{body}</Link>;
}

export default function HelpIndexPage() {
  const { user } = useAuth();
  const t = useTranslations('help');
  const locale = user?.locale ?? DEFAULT_LOCALE;
  const [query, setQuery] = useState('');
  const sections = useMemo(() => visibleSectionsFor(user), [user]);
  const docs = useMemo(() => buildSearchDocs(locale), [locale]);
  const trimmed = query.trim();
  const results = useMemo(() => (trimmed ? searchHelp(trimmed, docs, user) : []), [trimmed, docs, user]);

  // Fuzzy fallback — only once the literal pass has settled empty.
  const [fuzzyResults, setFuzzyResults] = useState<HelpFuzzySearchResult[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (trimmed && results.length === 0) {
      import('@matthewdbaldwin/microport-ui/help/fuzzy')
        .then(({ searchHelpFuzzy }) => searchHelpFuzzy(trimmed, docs, user))
        .then((r) => { if (!cancelled) setFuzzyResults(r); })
        .catch(() => { if (!cancelled) setFuzzyResults([]); });
    } else {
      // react-hooks/set-state-in-effect: defer the reset by a microtask rather
      // than calling setState synchronously in the effect body. The functional
      // form returns the same reference when already empty so React bails out
      // instead of scheduling a no-op render.
      Promise.resolve().then(() => { if (!cancelled) setFuzzyResults((prev) => (prev.length === 0 ? prev : [])); });
    }
    return () => { cancelled = true; };
  }, [trimmed, results, docs, user]);

  // Search-miss capture: recorded only when the literal pass is empty;
  // wasFuzzyRescued says whether the fallback found anything.
  useEffect(() => {
    if (!trimmed) return;
    const timer = setTimeout(() => {
      if (results.length === 0) recordHelpSearchMiss({ query: trimmed, wasFuzzyRescued: fuzzyResults.length > 0, locale });
    }, 600);
    return () => clearTimeout(timer);
  }, [trimmed, results, fuzzyResults, locale]);

  return (
    <div className="space-y-8">
      <header
        className="space-y-4 rounded-2xl border p-6 sm:p-8"
        style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))' }}
      >
        <h1 className="text-3xl font-semibold" style={{ color: 'var(--text)' }}>{t('libraryTitle')}</h1>
        <div className="relative max-w-xl">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
      </header>

      {trimmed ? (
        <div className="space-y-2">
          {results.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('noResultsFor', { query: trimmed })}</p>
              {fuzzyResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{t('didYouMean')}</p>
                  <ul className="space-y-2 opacity-80">
                    {fuzzyResults.map((r) => <li key={`fuzzy:${r.slug}`}><ResultRow r={r} /></li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {t('resultCount', { count: results.length })}
              </p>
              <ul className="space-y-2">
                {results.map((r) => <li key={r.slug}><ResultRow r={r} /></li>)}
              </ul>
            </>
          )}
        </div>
      ) : sections.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('noArticles')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => {
            const Icon = SECTION_ICON[section.id] ?? BookOpen;
            return (
              <section
                key={section.id}
                className="flex flex-col gap-3 rounded-xl border p-5"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
                  >
                    <Icon size={18} />
                  </span>
                  <h2 className="min-w-0 flex-1 text-base font-semibold" style={{ color: 'var(--text)' }}>{getSectionTitle(section.id, locale)}</h2>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: 'color-mix(in srgb, var(--muted) 14%, transparent)', color: 'var(--muted)' }}
                  >
                    {section.items.length}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`/help/${item.slug}`}
                        className="group flex items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                        style={{ color: 'var(--text)' }}
                      >
                        <ChevronRight size={14} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--accent)' }} />
                        {/* `?? item.label` is unreachable in practice: getHelpContent falls back to en, and help-audit Check 2 blocks any live slug with no en module. Kept only to satisfy the nullable type. */}
                        <span className="min-w-0">{getHelpContent(item.slug, locale)?.title ?? item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
