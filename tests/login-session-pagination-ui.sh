#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "login-session-pagination-ui: FAIL: $*" >&2; exit 1; }
ACCESS="${ROOT}/src/access.js"
PANEL="${ROOT}/src/components/access/AdminSessionsPanel.vue"
grep -A8 'export function listActiveLoginSessions' "$ACCESS" | grep -q 'page_size' || fail "active-session API helper is not paged"
grep -A8 'export function listActiveLoginSessions' "$ACCESS" | grep -q "query.set('search'" || fail "active-session API search missing"
grep -q 'const pageSize = 50' "$PANEL" || fail "50-row active-session page size missing"
grep -q 'setTimeout' "$PANEL" || fail "debounced active-session search missing"
grep -q 'load(page - 1)' "$PANEL" || fail "active-session previous-page control missing"
grep -q 'load(page + 1)' "$PANEL" || fail "active-session next-page control missing"
grep -q 'loading && !sessions.length' "$PANEL" || fail "populated rows are not preserved during refresh"
! grep -q 'filtered.length' "$PANEL" || fail "legacy client-only current-page filter remains"
echo "login-session-pagination-ui: PASS"
