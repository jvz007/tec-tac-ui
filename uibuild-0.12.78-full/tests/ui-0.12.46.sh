#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
node "$ROOT/tests/install-lockfile-u1.mjs"
node "$ROOT/tests/admin-sessions-l70.mjs"
node "$ROOT/tests/release-notes-l74.mjs"
PANEL="$ROOT/src/components/access/AdminSessionsPanel.vue"
grep -q 'createLatestRequestGate' "$PANEL"
grep -q 'requestGate.begin()' "$PANEL"
grep -q 'requestGate.isCurrent(requestId)' "$PANEL"
grep -q 'revokeSessionPrompt(row)' "$PANEL"
grep -q 'revokeUserSessionsPrompt(row)' "$PANEL"
echo 'ui-0.12.46: PASS'
