#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSS="$ROOT/src/styles.css"
VIEW="$ROOT/src/views/SystemUpdatesView.vue"

grep -q 'const trustPopoverHover = ref(null)' "$VIEW"
grep -q 'const trustPopoverFocus = ref(null)' "$VIEW"
grep -q 'function isTrustPopoverOpen(key)' "$VIEW"
grep -q '@mouseenter="trustPopoverHover = trustPopoverKey' "$VIEW"
grep -q '@mouseleave="trustPopoverHover = null"' "$VIEW"
grep -q '@focus="trustPopoverFocus = trustPopoverKey' "$VIEW"
grep -q '@blur="trustPopoverFocus = null"' "$VIEW"
grep -q 'v-if="isTrustPopoverOpen(trustPopoverKey' "$VIEW"
grep -q 'system-trust-popover{pointer-events:none' "$CSS"
if grep -Eq 'system-trust-(trigger|badge):(hover|focus|focus-visible|focus-within).*system-trust-popover' "$CSS"; then
  echo '[TEST] FAIL System Updates trust popover visibility still depends on CSS pseudo-state' >&2
  exit 1
fi
if grep -q 'system-trust-popover{display:none' "$CSS"; then
  echo '[TEST] FAIL System Updates trust popover still uses CSS hidden state' >&2
  exit 1
fi
echo '[TEST] PASS System Updates trust popover explicit pointer/focus state'
