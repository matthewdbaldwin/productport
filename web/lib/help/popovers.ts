// web/lib/help/popovers.ts
// The two Product-edit sub-section popovers (PRD item 4). These are NOT
// HELP_SECTIONS items and have no /help/<slug> article page — they render
// in-context via the legacy HelpButton component (Task 7) and are indexed
// into search separately as kind:'popover' docs, matching the PRD's "same
// click-through behavior as the other satellites' popover docs" requirement.
// targetHref is '/' for both: neither sub-section has its own addressable
// URL (ProductEditModal only opens against a specific product, chosen
// interactively, not via a deep link) — a search result click lands on the
// catalog root, from which the user opens Edit on any product to reach the
// section the popover describes.
//
// getPopoverContent/getPopoverTitle are locale-aware, mirroring content.ts's
// getHelpContent pattern — Global Constraints require zh/fr for every new
// string, popovers included, no carve-out. normalizeLocale comes from
// ./locale (not ./content) so this module never pulls the article corpus
// into the editor bundle.
//
// Facts verified 2026-09-04 against web/app/ProductEditModal.tsx: gallery
// actions each persist immediately via their own API call (not part of Save
// changes, not undone by Cancel); the clearance matrix saves with Save
// changes; a CSV import writes every region's Notes as null.
import type { HelpContent } from '@matthewdbaldwin/microport-ui/help';
import { normalizeLocale } from './locale';
import { POPOVERS as POPOVERS_ZH, POPOVER_TITLES as TITLES_ZH } from './popovers.zh';
import { POPOVERS as POPOVERS_FR, POPOVER_TITLES as TITLES_FR } from './popovers.fr';

export const GALLERY_POPOVER: HelpContent = {
  summary: 'Manage this product’s gallery: add, set primary, or delete images.',
  bullets: [
    'Add image accepts JPEG, PNG, or WebP up to 6 MB; the first image becomes the primary.',
    'Set primary controls which image shows on the catalog card.',
    'Delete asks you to confirm before removing an image.',
    'Every image change saves immediately and is not undone by Cancel.',
  ],
};

export const CLEARANCE_POPOVER: HelpContent = {
  summary: 'One row per region. Status, certificate number(s), qualifier, and notes are independent per row.',
  bullets: [
    'Certificate number(s) is the Registration evidence for an approved Clearance; separate multiple numbers with a pipe (CE-100|CE-200).',
    'Clearance changes save together with the rest of the form, via Save changes.',
    'A CSV import clears Notes for every region; certificate numbers and qualifiers round-trip.',
  ],
};

export const POPOVER_TITLES = {
  gallery:   'Managing product images',
  clearance: 'Editing the Clearance matrix',
} as const;

export type PopoverKey = 'gallery' | 'clearance';

const EN: Record<PopoverKey, HelpContent> = { gallery: GALLERY_POPOVER, clearance: CLEARANCE_POPOVER };
const CONTENT_BY_LOCALE: Record<'en' | 'zh' | 'fr', Record<PopoverKey, HelpContent>> = { en: EN, zh: POPOVERS_ZH, fr: POPOVERS_FR };
const TITLES_BY_LOCALE:  Record<'en' | 'zh' | 'fr', Record<PopoverKey, string>> = { en: POPOVER_TITLES, zh: TITLES_ZH, fr: TITLES_FR };

export function getPopoverContent(key: PopoverKey, locale: string = 'en-US'): HelpContent {
  return CONTENT_BY_LOCALE[normalizeLocale(locale)]?.[key] ?? EN[key];
}

export function getPopoverTitle(key: PopoverKey, locale: string = 'en-US'): string {
  return TITLES_BY_LOCALE[normalizeLocale(locale)]?.[key] ?? POPOVER_TITLES[key];
}
