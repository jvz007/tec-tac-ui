#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/tests/latest-request-gate.mjs"
grep -q "onlineRequestGate.begin(component)" "$ROOT/src/views/SystemUpdatesView.vue"
grep -q "branchRequestGate.begin(component)" "$ROOT/src/views/SystemUpdatesView.vue"
grep -q "onlineRequestGate.isCurrent(component, requestId)" "$ROOT/src/views/SystemUpdatesView.vue"
grep -q "branchRequestGate.isCurrent(component, requestId)" "$ROOT/src/views/SystemUpdatesView.vue"
echo 'ui 0.12.49 regression: PASS'
