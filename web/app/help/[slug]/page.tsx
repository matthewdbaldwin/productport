// Dynamic /help/<slug> — a server component (no 'use client'): the registry
// (@/lib/help/sections → microport-ui/help/logic, no React) and the content
// registry (plain data) are both server-safe, so the slug is validated here
// and a live one is handed to the client adapter. Anything not in
// HELP_SECTIONS, or a live slug whose content module is missing (help-audit
// Check 2 flags that), is a 404. Role gating for the article lives in the
// /help layout, which also holds the signed-in gate.
import { notFound } from 'next/navigation';
import { lookupHelpItem } from '@/lib/help/sections';
import { getHelpContent } from '@/lib/help/content';
import { HelpArticleClient } from '@/components/help/HelpArticleClient';

interface PageProps { params: Promise<{ slug: string }> }

export default async function HelpArticlePage({ params }: PageProps) {
  const { slug } = await params;
  // Resolve in en to decide whether an article exists; HelpArticleClient
  // re-resolves in the reader's locale (falling back to en).
  if (!lookupHelpItem(slug) || !getHelpContent(slug)) notFound();
  return <HelpArticleClient slug={slug} />;
}
