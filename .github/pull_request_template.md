<!--
The title becomes the squash-merge commit on master (and the "(#123)" GitHub
adds to it becomes the app version), so make it a short list of what ships,
e.g. "Swipe fixes, instant stats, security hardening and safety nets".
Comments like this one don't show on the PR; delete them or leave them.
-->

## What changed

<!-- User-visible changes first, in plain words; then the behind-the-scenes ones. -->

## How to test on a phone

<!--
What to try on a real device: on this branch's Vercel preview, or after merging.
Say what should happen, and what used to happen if it's a fix.
"Nothing to try" if nothing visible changed.
-->

## Database and deploy

<!--
Migrations in supabase/migrations/ are applied to the live database
automatically when this merges: say what each one does, and in plain words
anything it deletes or drops. Also list edge functions to deploy, and secrets
or dashboard settings to change by hand. "None" if there's nothing.
-->

## Checklist

- [ ] Lint, tests and build pass (CI runs them again on this PR)
- [ ] `WHATS_NEW` in `src/lib/appVersion.js` describes what this PR ships, or nothing user-visible changed
- [ ] README updated wherever it describes something this changes
- [ ] Design changes mirrored in `docs/design-system/` and the design system artifact, or no design change
- [ ] New migrations are timestamped, additive, and also in `supabase/schema.sql`, or no migration
