// web/e2e/help-captures/helpers/cursor.ts
// Injected with page.addInitScript() before any page script runs.
//
// Two jobs. First, pin the look: the light theme, so a capture does not
// inherit whatever theme the signed-in demo user happens to carry.
//
// ⚠ The key name must match the one THIS app actually reads, and a wrong name
// does not fail — it writes a key nothing consumes, and the capture then
// records in whatever theme was already there. Wrong output, no error.
// Verified against ProductPort's own source, not assumed from the app slug:
// 'productport_theme' is web/lib/theme.ts:17 (STORAGE_KEY), the value handed
// to createThemeApi({ storageKey }) at web/lib/theme.ts:41 and read back by
// the inline themeScript in web/app/layout.tsx. Re-check if that file moves.
//
// ⚠ The pin is CONTESTED, not merely set. microport-ui's
// reconcileThemeWithUser() is server-wins by construction: given a server theme
// that differs from the stored one it overwrites the key and applies it
// (@matthewdbaldwin/microport-ui dist/themes/index.js:102-115 — there is no
// "only when empty" check inside the library, and unlike OpsPort there is no
// `hasLocal` guard on ProductPort's caller side either: web/app/auth/callback/
// page.tsx:43 calls it unconditionally with data.user?.theme).
//
// What actually protects the pin HERE is narrower than a caller-side guard, so
// state it precisely: reconcileThemeWithUser runs on exactly one route,
// /auth/callback, which only e2e/auth.setup.ts ever drives. Capture specs start
// from the saved storageState and never navigate there, and addInitScript
// re-writes the key on every navigation BEFORE any app script runs — including
// before layout.tsx's themeScript reads it. So a demo user with a dark theme on
// the server poisons e2e/.auth/admin.json's localStorage, and this line
// un-poisons it on each page load. Remove this and captures silently adopt that
// user's saved theme.
//
// There is deliberately NO locale write here. OpsPort's original pins an
// `opsport_locale` localStorage key; ProductPort has no equivalent — the active
// locale comes from the NEXT_LOCALE *cookie* read server-side in web/i18n.ts:8,
// and nothing in the app writes it (see the note at
// web/components/help/HelpArticleClient.tsx:10). Writing a
// `productport_locale` key here would be exactly the silent-wrong-output
// footgun the paragraph above warns about: a key nothing consumes. The locale
// is pinned as a cookie instead, in ./clip.ts's `locale` fixture.
//
// Second, draw the pointer. Playwright moves a real mouse but the browser
// paints no cursor into a recorded video, so without this a clip shows menus
// opening for no visible reason.

export function installCursor(): void {
  try {
    localStorage.setItem('productport_theme', 'light');
  } catch { /* storage unavailable; the capture still works, just themed by default */ }

  const mount = () => {
    if (document.getElementById('hm-cursor')) return;

    const style = document.createElement('style');
    // Teal, carried over from OpsPort's original on purpose: it is the fleet's
    // help-media cursor colour, and it also happens to contrast with
    // ProductPort's own blue accent (--catalog-blue / #0067B1), which a
    // brand-coloured ring would disappear into over the catalog's buttons.
    style.textContent = [
      '#hm-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:22px;',
      'margin:-11px 0 0 -11px;border:2px solid rgba(0,194,168,.95);border-radius:50%;',
      'background:rgba(0,194,168,.16);pointer-events:none;opacity:0;',
      'transition:left .07s linear,top .07s linear,opacity .2s linear}',
      '#hm-cursor.on{opacity:1}',
      '.hm-ripple{position:fixed;z-index:2147483646;width:16px;height:16px;margin:-8px 0 0 -8px;',
      'border:2px solid rgba(0,194,168,.9);border-radius:50%;pointer-events:none;',
      'animation:hm-ripple .45s ease-out forwards}',
      '@keyframes hm-ripple{to{transform:scale(3.2);opacity:0}}',
    ].join('');
    document.head.appendChild(style);

    const ring = document.createElement('div');
    ring.id = 'hm-cursor';
    document.body.appendChild(ring);

    addEventListener('mousemove', (e) => {
      ring.classList.add('on');
      ring.style.left = `${e.clientX}px`;
      ring.style.top  = `${e.clientY}px`;
    }, true);

    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = 'hm-ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top  = `${e.clientY}px`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 500);
    }, true);
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount);
  else mount();
}
