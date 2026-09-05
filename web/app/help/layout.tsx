'use client';

// /help — layout for the ProductPort help library. Signed-in users only: the
// same router.replace('/login') gate app/page.tsx applies to the catalog
// (ProductPort's /login auto-starts SSO and ignores any returnTo), so nothing
// under /help renders pre-auth. An article a viewer may not see bounces to the
// index. Mounts the ⌘K palette, scoped to /help, over the same corpus the
// index search and the top-bar HelpLauncher use.
//
// ONE exception: /help/login ("Signing in") exists for people who cannot sign
// in, so a signed-out visitor on exactly that path gets the article in a bare
// shell — no palette, no library link, nothing that lists other sections. The
// index and every other slug still redirect. The article itself renders with
// `user` null (HelpArticleClient passes useAuth().user straight through):
// microport-ui's canSee() is false for a null user, so the view drops its
// pager and related cards and nothing gated leaks to a guest.
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { HelpCommandPalette } from '@matthewdbaldwin/microport-ui/help';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOCALE } from '@/lib/locales';
import { canSeeHelpItem, lookupHelpItem } from '@/lib/help/sections';
import { buildSearchDocs } from '@/lib/help/searchDocs';

/** The only /help path a signed-out visitor may read. */
const GUEST_PATH = '/help/login';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('help');
  const locale = user?.locale ?? DEFAULT_LOCALE;
  const docs = useMemo(() => buildSearchDocs(locale), [locale]);

  const guestReadable = pathname === GUEST_PATH;
  useEffect(() => {
    if (!loading && !user && !guestReadable) router.replace('/login');
  }, [loading, user, guestReadable, router]);

  const activeSlug = pathname?.replace(/^\/help\/?/, '').split('/')[0] || '';
  useEffect(() => {
    if (!user || !activeSlug) return;
    const entry = lookupHelpItem(activeSlug);
    if (entry && !canSeeHelpItem(user, entry.item)) router.replace('/help');
  }, [user, activeSlug, router]);

  // HelpCommandPalette.onNavigate hands back a bare slug with no `kind`. The
  // two popover docs (product-edit-*-popover) have no /help page, so route them
  // to their targetHref — never to /help/<slug>, which would 404.
  const onNavigate = (slug: string) => {
    const doc = docs.find((d) => d.slug === slug);
    if (doc?.kind === 'popover') {
      if (doc.targetHref) router.push(doc.targetHref);
      return;
    }
    router.push(`/help/${slug}`);
  };

  if (loading) return null;

  if (!user) {
    if (!guestReadable) return null;
    // Guest shell: the article only. "Back to ProductPort" lands on `/`,
    // which is the sign-in redirect — exactly where a reader of this article
    // wants to go next.
    return (
      <div className="min-h-screen min-h-dvh" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <header className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
              style={{ color: 'var(--muted2)' }}
            >
              <ArrowLeft size={14} />
              {t('backToApp')}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <HelpCommandPalette docs={docs} user={user} onNavigate={onNavigate} />
      <header className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted2)' }}
          >
            <ArrowLeft size={14} />
            {t('backToApp')}
          </Link>
          {activeSlug && (
            <Link
              href="/help"
              className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--text)' }}
            >
              <BookOpen size={14} />
              {t('libraryTitle')}
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
