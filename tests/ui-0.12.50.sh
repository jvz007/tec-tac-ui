#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/tests/ui-0.12.50.mjs"
node --check "$ROOT/src/admin-session-state.js"
echo "ui 0.12.50: PASS"
