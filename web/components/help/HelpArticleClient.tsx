'use client';

// web/components/help/HelpArticleClient.tsx
// Adapter for the shared HelpArticleView (microport-ui ./help). The generic
// glue (useUser + useLocale + content resolution + null guard + render) lives
// behind createHelpArticleClient; this file only supplies ProductPort's ports.
//
// Locale: useAuth().user.locale — the hub-provisioned DB column
// (src/middleware/auth.js) — is the only per-user locale signal this app
// carries (nothing writes the NEXT_LOCALE cookie next-intl reads), and it is
// what the popovers (ProductEditModal) and the search corpus (HelpLauncher,
// /help) resolve against too, so article, popover and search agree.
//
// Chrome strings come from the `help` namespace of messages/*.json. getStrings
// is a plain port the generated component invokes AFTER its early
// `return null`, so it must not call a hook — it reads the namespace from the
// bundled message files by locale instead.
//
// Section titles: HelpArticleView derives its breadcrumb's middle crumb from
// the `sections` port (`sections.find(…)?.title`), and that port is a static
// array, not a per-render function — so one client is built per locale over
// localizedSections(locale) and the exported component picks the right one
// from the same useAuth() locale the inner useLocale port reads.
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOCALE } from '@/lib/locales';
import { localizedSections } from '@/lib/help/sectionTitles';
import { getHelpContent, normalizeLocale, type HelpLocale } from '@/lib/help/content';
import { createHelpArticleClient, type HelpViewStrings } from '@matthewdbaldwin/microport-ui/help';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import fr from '@/messages/fr.json';

const HELP_CHROME: Record<HelpLocale, { helpLabel: string }> = { en: en.help, zh: zh.help, fr: fr.help };

function helpViewStrings(locale: string): Partial<HelpViewStrings> {
  return { help: HELP_CHROME[normalizeLocale(locale)].helpLabel };
}

// Full codes, so localizedSections normalises them the same way getHelpContent
// does (a bare 'zh' would fall back to en — see searchDocs.ts).
const CLIENT_LOCALE: Record<HelpLocale, string> = { en: 'en-US', zh: 'zh-CN', fr: 'fr-FR' };

function makeClient(locale: HelpLocale) {
  return createHelpArticleClient({
    useUser: () => useAuth().user,
    useLocale: () => useAuth().user?.locale ?? DEFAULT_LOCALE,
    getContent: (slug, l) => getHelpContent(slug, l),
    getStrings: helpViewStrings,
    sections: localizedSections(CLIENT_LOCALE[locale]),
    linkComponent: Link,
  });
}

const CLIENTS: Record<HelpLocale, ReturnType<typeof makeClient>> = {
  en: makeClient('en'),
  zh: makeClient('zh'),
  fr: makeClient('fr'),
};

export function HelpArticleClient({ slug }: { slug: string }) {
  const { user } = useAuth();
  const Client = CLIENTS[normalizeLocale(user?.locale ?? DEFAULT_LOCALE)];
  return <Client slug={slug} />;
}
