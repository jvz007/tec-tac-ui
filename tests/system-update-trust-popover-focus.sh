#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSS="$ROOT/src/styles.css"
VIEW="$ROOT/src/views/SystemUpdatesView.vue"
grep -q 'system-trust-trigger:hover + .system-trust-popover' "$CSS"
grep -q 'system-trust-trigger:focus-visible + .system-trust-popover' "$CSS"
grep -q 'system-trust-popover{display:none;pointer-events:none' "$CSS"
if grep -q 'system-trust-badge:hover .system-trust-popover' "$CSS"; then
  echo '[TEST] FAIL wrapper hover makes the popover itself part of the hover region' >&2
  exit 1
fi
if grep -q 'system-trust-badge:focus' "$CSS"; then
  echo '[TEST] FAIL wrapper focus pins System Updates trust popover' >&2
  exit 1
fi
grep -q 'class="pill system-trust-trigger" tabindex="0"' "$VIEW"
if grep -q 'class="system-trust-badge" tabindex="0"' "$VIEW"; then
  echo '[TEST] FAIL wrapper remains keyboard focus target' >&2
  exit 1
fi
echo '[TEST] PASS System Updates trust popover trigger behaviour'
