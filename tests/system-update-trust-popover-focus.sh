#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSS="$ROOT/src/styles.css"
VIEW="$ROOT/src/views/SystemUpdatesView.vue"
grep -q 'system-trust-badge:hover .system-trust-popover' "$CSS"
grep -q 'system-trust-badge:focus-visible .system-trust-popover' "$CSS"
if grep -q 'system-trust-badge:focus .system-trust-popover' "$CSS"; then
  echo '[TEST] FAIL ordinary focus pins System Updates trust popover' >&2
  exit 1
fi
if grep -q 'system-trust-badge:focus-within .system-trust-popover' "$CSS"; then
  echo '[TEST] FAIL focus-within pins System Updates trust popover' >&2
  exit 1
fi
grep -q 'class="system-trust-badge" tabindex="0"' "$VIEW"
echo '[TEST] PASS System Updates trust popover focus behaviour'
