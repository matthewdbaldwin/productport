// tests/helpAudit.test.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

test('help-audit.js reports zero blockers against the current repo state', () => {
  const script = path.join(__dirname, '..', 'scripts', 'help-audit.js');
  let out;
  try {
    out = execFileSync('node', [script, '--json'], { encoding: 'utf8' });
  } catch (err) {
    // The script exits 1 when it finds blockers, which makes execFileSync
    // throw. Its JSON still landed on stdout — parse that so the failure
    // names the actual blockers instead of just "Command failed".
    if (typeof err.stdout !== 'string' || !err.stdout.trim()) throw err;
    out = err.stdout;
  }
  const report = JSON.parse(out);
  expect(report.findings.blocker).toEqual([]);
  expect(report.totals.blocker).toBe(0);
});
