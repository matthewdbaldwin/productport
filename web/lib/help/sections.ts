// Help-library section registry — single source of truth for /help's nav,
// role-gated visibility, the search corpus (Task 4), and help-audit.js's
// coverage check (Task 9, Check 1).
//
// All six items ship status:'live' from day one — the PRD explicitly
// rejected wave-splitting (hubport#44), so there is no 'stub' status in use
// here, unlike HubPort's Shell plan.
//
// `components` (ProductPort-specific — replaces the route-keyed `routes[]`
// field other satellites use): ProductPort's whole authenticated UI is one
// SPA route (web/app/page.tsx), so coverage is keyed by which component
// file each logical view's trigger should live in, not by a distinct
// Next.js route. `product-create` and `product-edit` legitimately share
// ProductEditModal.tsx — help-audit.js's uniqueness check is relaxed for
// this field for that reason (see Task 9).
import { canSee } from '@matthewdbaldwin/microport-ui/help/logic';

export interface HelpItem {
  slug:       string;
  label:      string;
  status:     'live' | 'stub';
  /** Restrict visibility to these roles. Omit for "every signed-in user". */
  roles?:     string[];
  /** Every component file this help topic covers. */
  components: string[];
}

export interface HelpSection {
  id:    string;
  title: string;
  items: HelpItem[];
}

const ADMIN = ['product_admin', 'superuser'];

export const HELP_SECTIONS: HelpSection[] = [
  {
    id:    'catalog',
    title: 'Catalog',
    items: [
      { slug: 'catalog-browse', label: 'Browse & filter', status: 'live', components: ['app/page.tsx'] },
      { slug: 'product-detail', label: 'Product detail',  status: 'live', components: ['app/page.tsx'] },
    ],
  },
  {
    id:    'admin',
    title: 'Product administration',
    items: [
      { slug: 'product-create', label: 'Add a product',       status: 'live', roles: ADMIN, components: ['app/ProductEditModal.tsx'] },
      { slug: 'product-edit',   label: 'Edit a product',       status: 'live', roles: ADMIN, components: ['app/ProductEditModal.tsx'] },
      { slug: 'csv-import',     label: 'CSV import & export',  status: 'live', roles: ADMIN, components: ['app/ImportCsvButton.tsx', 'app/page.tsx'] },
    ],
  },
  {
    id:    'account',
    title: 'Account',
    items: [
      { slug: 'login', label: 'Signing in', status: 'live', components: ['app/login/page.tsx', 'app/auth/callback/page.tsx'] },
    ],
  },
];

export const HELP_SLUGS = new Set(
  HELP_SECTIONS.flatMap(s => s.items.map(i => i.slug)),
);

export function lookupHelpItem(slug: string): { section: HelpSection; item: HelpItem } | undefined {
  for (const section of HELP_SECTIONS) {
    const item = section.items.find(i => i.slug === slug);
    if (item) return { section, item };
  }
  return undefined;
}

export interface HelpGateUser {
  role:         string;
  isSuperuser?: boolean;
}

// The app's real admin gate (app/page.tsx `isAdmin`) admits `isSuperuser ===
// true` whatever the role string says, but microport-ui's canSee only matches
// `roles` against `user.role`. Mirror the app: a superuser flag satisfies any
// `roles` restriction, so strip it before delegating. Status and everything
// else still go through canSee unchanged.
function asGatedFor(item: HelpItem, user: HelpGateUser): HelpItem {
  return user.isSuperuser === true && item.roles ? { ...item, roles: undefined } : item;
}

export function canSeeHelpItem(user: HelpGateUser | null | undefined, item: HelpItem): boolean {
  if (!user) return false;
  return canSee(user, asGatedFor(item, user));
}

// Same shape visibleLiveSectionsFor(HELP_SECTIONS, user) returned, but built
// on canSeeHelpItem so the superuser rule above applies to /help's nav too.
// Items are the registry's own objects (roles intact), not the gated copies.
export function visibleSectionsFor(user: HelpGateUser | null | undefined): HelpSection[] {
  if (!user) return [];
  return HELP_SECTIONS
    .map(section => ({ ...section, items: section.items.filter(i => i.status === 'live' && canSeeHelpItem(user, i)) }))
    .filter(section => section.items.length > 0);
}
