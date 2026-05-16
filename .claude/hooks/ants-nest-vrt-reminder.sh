#!/usr/bin/env bash
# PreToolUse hook for Bash. Reminds Claude (and the user via stderr) to run the
# ants-nest-simulator visual regression tests before creating a PR that touches
# the simulator. The reminder is non-blocking — it prints to stderr and exits 0.

set -e

# Read the hook payload (JSON) from stdin and extract the bash command.
payload="$(cat || true)"
cmd="$(printf '%s' "$payload" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

# Only act on `gh pr create` invocations.
case "$cmd" in
  *"gh pr create"*) : ;;
  *) exit 0 ;;
esac

# Determine the base branch (origin/main) and diff filenames.
base="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)"
changed="$(git diff --name-only "$base"...HEAD 2>/dev/null || true)"

if printf '%s\n' "$changed" | grep -qE '^(ants-nest-simulator/|tests/ant-nest)'; then
  cat >&2 <<'EOF'
⚠️  ants-nest-simulator changes detected on this branch.

Before submitting the PR, you MUST:
  1. Run `npx playwright test ant-nest-evolution` and review the 5 screenshots
  2. Run `npx playwright test ant-nest-regression` (300k step guard)
  3. Complete the VRT checklist in .github/pull_request_template.md

CI does not run these tests; this is the only signal.
EOF
fi

exit 0
