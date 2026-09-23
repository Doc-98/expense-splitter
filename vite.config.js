import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { findLatestVersion } from './src/lib/versionFromCommit.js'

// The app's version number is derived from git, not hand-maintained: every
// PR merged into this repo is squash-merged, and GitHub always appends
// " (#123)" to a squash-merge's own commit subject, so the most recent
// commit already names its own PR number. Walking recent subjects (newest
// first) until one has a PR number means the version can never drift from
// what's actually shipped — see src/lib/versionFromCommit.js for the actual
// extraction logic (kept there, pure and unit-tested, independent of git).
// Falls back to 'dev' for a shallow checkout or a repo with no matching
// history (e.g. a fresh clone with no git dir at all).
function readAppVersion() {
  try {
    const log = execSync('git log --pretty=%s -50', { encoding: 'utf-8' })
    const subjects = log.split('\n').filter(Boolean)
    return findLatestVersion(subjects) || 'dev'
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(readAppVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      // Was 'autoUpdate' — a new deployed version used to take over silently
      // in the background with no way to see or trigger it. 'prompt' instead
      // leaves a new service worker waiting until something explicitly
      // activates it, which is what makes the Settings > Updates section's
      // "Check for updates" / "Reload to update" actually mean something
      // (see src/components/SettingsUpdatesSection.jsx's useRegisterSW call)
      // rather than almost always just reporting "up to date" because the
      // update had already silently applied before anyone looked.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      workbox: {
        // clientsClaim: without this, calling skipWaiting() (which is what
        // "Reload to update" below does) only moves the new service worker
        // into the active state — it does NOT hand it control of tabs that
        // are already open. The browser only fires 'controllerchange' (what
        // useRegisterSW's built-in reload-after-update is waiting on) once
        // control actually changes hands, so without this, clicking
        // "Reload to update" quietly did nothing: the new worker activated
        // in the background, but the open tab kept being served by the old
        // one until someone closed and reopened it by hand. clientsClaim
        // makes the newly-active worker claim already-open tabs too, which
        // is what actually fires that event and lets the reload happen.
        clientsClaim: true,
        // Default globPatterns only picks up .js, not .mjs — which is
        // exactly what pdfText.js's `?url` import of pdfjs-dist's worker
        // script emits as its own separate built asset (referenced only by
        // URL string, so it's invisible to the default JS-module scan).
        // Without this, that ~1.3MB worker file never gets precached: it
        // still works the very first time (fetched live over the network
        // the moment a PDF scan actually needs it), but going offline
        // before ever scanning a PDF once would leave that one path broken
        // — everything else in the app stays fully precached regardless.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,webmanifest}'],
      },
      manifest: {
        name: 'Spesa - Expense Splitter',
        short_name: 'Spesa',
        description: 'Split receipts and expenses with your group, in real time.',
        theme_color: '#2F6F5E',
        background_color: '#FAF9F6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
})
