import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.js rather than merged into it —
// that config's VitePWA plugin generates a service worker and manifest on
// every build, neither of which a test run needs or should pay the cost
// of. jsdom (not the default 'node') because a few tests exercise browser
// APIs this app's own lib/ modules use directly — localStorage
// (bankCategoryMappings.js, receiptSettings.js) chief among them.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // Reuses one jsdom instance per worker instead of spinning up a fresh
    // one per test file — vitest's own perf warning suggested this once
    // the suite passed 10 files, and it's a one-line change with no
    // downside for how these tests are written (each already cleans up
    // after itself, e.g. bankCategoryMappings.test.js's beforeEach).
    pool: 'vmThreads',
  },
})
