import next from 'eslint-config-next';

// Flat config for ESLint 9 / Next 16. `next lint` was removed in Next 16, and
// the prior FlatCompat(extends 'next/core-web-vitals', 'next/typescript') threw a
// "circular structure" error on eslint-config-next@16 — whose main export is now
// a flat-config array, so we spread it directly.
//
// react-hooks rules from React-19/React-Compiler all promoted to error after
// each one was driven to zero platform-wide (2026-05-27):
//   /refs              ✓ rp+ep fixes
//   /static-components ✓ salesport GlobalSearch hoist
//   /purity            ✓ 6 files: Date.now/new Date → module-level helpers
//   /immutability      ✓ FormModal props + SatellitePicker window.location.assign
//   /set-state-in-effect ✓ 194 sites suppressed with eslint-disable-next-line
//                          on legitimate patterns (async fetch, bootstrap,
//                          multi-writer state sync). See [[next16-lint-flat-config]].
//
// No rule overrides remain — every react-hooks rule is at its default (error).
export default [
  ...next,

  // ── Shared-code adoption guard (2026-09-06) ────────────────────────────────
  // Both counter-patterns below were driven to ZERO across all six satellites
  // before these were promoted to error, following the same discipline as the
  // react-hooks promotions above. They exist because adoption of a shared export
  // had stalled four separate times: useOutsideClick sat at 0/9 adoption for four
  // consecutive microport-ui releases while ~28 hand-inlined copies of the same
  // mousedown dance stayed in the tree. Publishing the shared code was never the
  // bottleneck; nothing stopped the next copy from being written.
  //
  // To use a genuinely different behaviour, disable per line WITH a reason —
  // that turns a silent re-divergence into a reviewable one.
  //
  // NOTE: this block is duplicated in all six satellites' eslint.config.mjs.
  // The right home is a shared eslint config exported from microport-ui, which
  // is gated behind the v0.46.0 release. Keep the copies in step until then.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message:
            "Use formatDate from '@matthewdbaldwin/microport-ui' instead of a raw " +
            'toLocaleDateString call. It takes the same Intl.DateTimeFormatOptions and ' +
            "passes the locale straight through, and it returns '' for a null, empty or " +
            'unparseable value rather than rendering the literal "Invalid Date". ' +
            "For a placeholder, write formatDate(v, opts) || '\u2014'.",
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(document|window)$/][callee.property.name='addEventListener'][arguments.0.value='mousedown']",
          message:
            "Use useOutsideClick from '@matthewdbaldwin/microport-ui' instead of a " +
            'hand-rolled document mousedown listener. It also attaches touchstart (so the ' +
            'panel closes on an outside tap on mobile), takes an { enabled } gate instead of ' +
            'a conditional attach, and holds the handler in a ref so it cannot capture stale state.',
        },
      ],
    },
  },
];
