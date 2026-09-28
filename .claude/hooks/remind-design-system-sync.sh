#!/usr/bin/env bash
# PostToolUse hook for Bash: after a `git commit` that touches the app's
# design (colours, type, spacing, component styles, icons, logo, theme
# colour), remind Claude to sync the Spesa design system artifact — see
# "Design system" in CLAUDE.md. It only reminds; the sync itself (reading
# and republishing the artifact's files) is Claude's job in the same round.
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?commit\b' || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
changed=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null) || exit 0

hits=$(printf '%s\n' "$changed" | grep -E '^(src/styles\.css|index\.html|src/lib/categories\.js|src/components/icons\.jsx|public/favicon\.svg|public/icon-[^/]*\.png)$')
# vite.config.js only counts when the PWA theme/background colour changed.
if printf '%s\n' "$changed" | grep -qx 'vite.config.js' &&
   git show HEAD -- vite.config.js | grep -qE '^[+-][^+-].*(theme_color|background_color)'; then
  hits=$(printf '%s\nvite.config.js (theme colour)' "$hits")
fi
hits=$(printf '%s' "$hits" | sed '/^$/d')
[ -z "$hits" ] && exit 0

sha=$(git rev-parse --short HEAD)
files=$(printf '%s' "$hits" | paste -sd, - | sed 's/,/, /g')
jq -n --arg sha "$sha" --arg files "$files" '{
  systemMessage: ("Design files changed in \($sha) — the design system artifact needs syncing."),
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("Commit \($sha) changed design files (\($files)). Per CLAUDE.md \"Design system\", sync the Spesa design system artifact (https://claude.ai/artifact/MS1SXZnKufV5iFF3qXPj2n) in this same round: read its project/design-system.json and each file you will change, mirror the change (tokens.json, components/bundle.css, README.md, affected component README/preview, assets), set lastChange.via to \"GitHub · doc-98/expense-splitter@\($sha)\", and republish. Say in your reply what was synced.")
  }
}'
