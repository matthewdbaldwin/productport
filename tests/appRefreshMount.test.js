// tests/appRefreshMount.test.js
// Structural check on the withFreshAccessToken mount in app.js. Deliberately
// does NOT boot the full app (booting app.js pulls in every router's own
// dependencies, including ones needing a live DB) — asserts the mount line
// is present and sits between csrfGuard and the /api/auth router mount,
// which is what makes it run ahead of every current and future
// requireAuth-gated router.
'use strict';

const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

test('withFreshAccessToken is mounted on /api', () => {
  expect(appSrc).toMatch(/app\.use\(\s*['"]\/api['"]\s*,\s*withFreshAccessToken\s*\)/);
});

test('the mount sits after csrfGuard and before the /api/auth router', () => {
  const csrfIdx  = appSrc.indexOf("app.use('/api', csrfGuard)");
  const mountIdx = appSrc.search(/app\.use\(\s*['"]\/api['"]\s*,\s*withFreshAccessToken\s*\)/);
  const authIdx  = appSrc.indexOf("app.use('/api/auth', require('./routes/auth'))");

  expect(csrfIdx).toBeGreaterThan(-1);
  expect(mountIdx).toBeGreaterThan(-1);
  expect(authIdx).toBeGreaterThan(-1);
  expect(mountIdx).toBeGreaterThan(csrfIdx);
  expect(mountIdx).toBeLessThan(authIdx);
});

test('withFreshAccessToken is imported from ./middleware/auth', () => {
  expect(appSrc).toMatch(/require\(['"]\.\/middleware\/auth['"]\)/);
  expect(appSrc).toMatch(/withFreshAccessToken/);
});
