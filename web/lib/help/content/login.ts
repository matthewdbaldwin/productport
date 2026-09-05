// web/lib/help/content/login.ts — "Signing in" (section: Account).
// Grounded in app/login/page.tsx, app/auth/callback/page.tsx,
// lib/ssoLoopGuard.ts, components/layout/ProfileModal.tsx and
// components/profile/SignOutSection.tsx. The `labels` here are the exact
// `auth.*` / `profile.*` values from messages/en.json (the only translated
// strings in this app); the zh/fr siblings carry their own locale's values.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const login: HelpArticleContent = {
  slug:  'login',
  title: 'Signing in',
  intro: 'ProductPort has no password of its own. You sign in through the Company Portal at hub.microport.com, and ProductPort trusts the answer it gets back.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'how-it-works', heading: 'How sign-in works',
      blocks: [
        { kind: 'steps', steps: [
          'Open ProductPort. If you aren’t signed in, you land on the sign-in page, which reads Redirecting to Company Portal… and sends you to the portal by itself. The Sign in with Company Portal button is only a fallback: click it if the redirect doesn’t happen.',
          'Sign in at the Company Portal. Once it has confirmed who you are, it sends you back to ProductPort.',
          'ProductPort shows Completing sign-in… for a moment, then opens the catalog.',
        ], labels: ['Redirecting to Company Portal…', 'Sign in with Company Portal', 'Completing sign-in…'] },
        { kind: 'paragraph', text: 'A session lasts 8 hours by default. After that, ProductPort sends you back through sign-in the next time you load a page.' },
      ],
    },
    {
      id: 'access', heading: 'Who can sign in, and what you can do',
      blocks: [
        { kind: 'paragraph', text: 'Every employee gets read-only access by default: you can browse and search the catalog, open product details and copy a product link.' },
        { kind: 'paragraph', text: 'Product administrator rights, which unlock adding, editing, importing and exporting products, are granted by an administrator in the Company Portal, not inside ProductPort. Your current role is shown in the profile panel.' },
      ],
    },
    {
      id: 'trouble', heading: 'If sign-in doesn’t complete',
      blocks: [
        { kind: 'list', items: [
          'The page says sign-in couldn’t be completed and offers Back to sign-in. Click it to start again. If it keeps failing, contact your administrator.',
          'The page says access was denied. Ask an administrator to grant your ProductPort access in the Company Portal. The message may name SalesPort, the portal’s older name; it means the same place.',
          'Sign-in keeps bouncing. If you are sent to the portal more than twice within about 12 seconds, ProductPort stops and shows a Try again button. Click it once; if the same thing happens again, contact your administrator.',
          'Cookies are blocked. If your browser blocks cookies or site storage (Safari with Block All Cookies turned on, and some private browsing modes), sign-in cannot complete and the page says so. Change the setting or leave private browsing, then try again.',
        ], labels: ['Back to sign-in', 'Try again'] },
      ],
    },
    {
      id: 'profile', heading: 'Your profile and signing out',
      blocks: [
        { kind: 'paragraph', text: 'The Profile icon in the top bar opens a side panel showing your name, email and role. They are managed centrally and are read-only here; Manage your account opens the Company Portal in a new tab.', labels: ['Profile', 'Manage your account'] },
        { kind: 'paragraph', text: 'The Theme picker changes how ProductPort looks. Your choice is saved to your account and follows you to other MicroPort apps.', labels: ['Theme'] },
        { kind: 'paragraph', text: 'Sign out is at the bottom of the panel, and it is the only place in ProductPort to sign out. Afterwards you land on the sign-in page, which starts sign-in again straight away, so close the tab if you are finished.', labels: ['Sign out'] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Do I have a separate ProductPort password?', a: 'No. ProductPort never asks for a password; you always sign in through the Company Portal.' },
          { q: 'Why was I sent back to sign-in while I was working?', a: 'Your session had expired. A session lasts 8 hours by default; sign in again to carry on.' },
          { q: 'I can see the catalog but can’t add or edit products. Why?', a: 'You have read-only access. Ask an administrator to grant you product administrator rights in the Company Portal.' },
          { q: 'Why does the access-denied message mention SalesPort?', a: 'SalesPort is the older name of the Company Portal. Ask an administrator to grant your access there.' },
          { q: 'I signed out and was sent straight back to the sign-in page. Is that normal?', a: 'Yes. The sign-in page starts sign-in again automatically. If you are finished, close the tab instead.' },
        ] },
      ],
    },
  ],
  related: ['catalog-browse'],
};

export default login;
