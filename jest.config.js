module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Excludes the default node_modules match plus the .claude/worktrees/ duplicate
  // checkouts (full nested clones of this repo used for agent isolation) — without
  // this, jest picks up their tests/**/*.test.js too and double-counts suites.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  // Run with `CI=true npm test` locally — rate limiters skip only when CI=true.
  // feedback_rate_limiter_dev_skip.
};
