#!/usr/bin/env bash
# PreToolUse hook for the Supabase SQL tools (execute_sql, apply_migration).
#
# Everything is pre-approved in .claude/settings.json — this is the one
# exception: SQL that deletes something still gets the usual one-click
# confirmation. "Deletes something" means removing rows (DELETE FROM,
# TRUNCATE) or dropping a database object (table, column, policy, function,
# index, ...). Comments are ignored, so a migration merely *mentioning* a
# delete in its explanation doesn't prompt; "on delete cascade" in a foreign
# key, "drop default"/"drop not null" and a column named deleted_at don't
# either. When unsure, it errs towards asking.
input=$(cat)
sql=$(printf '%s' "$input" | jq -r '.tool_input.query // empty')
[ -z "$sql" ] && exit 0

# Strip /* block */ and -- line comments, then fold everything onto one
# line so a statement split across lines ("DROP\n  TABLE") is still seen.
code=$(printf '%s' "$sql" | perl -0pe 's{/\*.*?\*/}{}gs; s{--[^\n]*}{}g; s{\s+}{ }g')

pattern='\b(delete[[:space:]]+from|truncate)\b|\bdrop[[:space:]]+(table|column|policy|function|procedure|index|view|materialized|trigger|schema|type|constraint|extension|sequence|role|owned|publication|rule|domain|aggregate|operator|database)\b'

if printf '%s' "$code" | grep -qiE "$pattern"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "This SQL deletes something (DELETE/TRUNCATE rows or DROPs a database object) — confirm before it runs."
    }
  }'
fi
exit 0
