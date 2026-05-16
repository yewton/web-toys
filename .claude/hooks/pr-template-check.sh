#!/usr/bin/env bash
# PreToolUse hook: blocks `gh pr create` unless the PR body follows the project template.
#
# Enforced rules:
#   1. Body must contain a "## Summary" section (template compliance)
#   2. Body must not contain Japanese characters (English-only policy)
#
# To pass: read .github/pull_request_template.md, fill every section in English,
# and check off applicable checklist items before calling `gh pr create`.

payload="$(cat || true)"

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"

case "$cmd" in
  *"gh pr create"*) : ;;
  *) exit 0 ;;
esac

# Show the template for reference.
tmpl=".github/pull_request_template.md"
if [ -f "$tmpl" ]; then
  printf '\n📋  PR template (%s):\n' "$tmpl" >&2
  cat "$tmpl" >&2
  printf '\n' >&2
fi

# Rule 1: ## Summary section must be present.
if ! printf '%s' "$cmd" | grep -qF '## Summary'; then
  printf '{"decision":"block","reason":"PR body is missing the required ## Summary section. Read .github/pull_request_template.md and write the body in English following the template structure."}\n'
  exit 0
fi

# Rule 2: No Japanese characters (hiragana U+3040-309F, katakana U+30A0-30FF, CJK U+4E00-9FFF).
if printf '%s' "$cmd" | python3 -c '
import sys, re
if re.search(r"[぀-ヿ一-鿿]", sys.stdin.read()):
    raise SystemExit(1)
' 2>/dev/null; then
  : # OK — no Japanese found
else
  printf '{"decision":"block","reason":"PR body must be written in English. Japanese characters were detected — rewrite the body in English."}\n'
  exit 0
fi

exit 0
