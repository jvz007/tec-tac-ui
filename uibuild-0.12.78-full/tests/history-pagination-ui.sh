#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "history-pagination-ui: FAIL: $*" >&2; exit 1; }
grep -q "page_size" "${ROOT}/src/modules.js" || fail "module history helper is not paged"
grep -q "historyTotal" "${ROOT}/src/views/ModulesView.vue" || fail "module history total metadata missing"
grep -q "historyPage - 1" "${ROOT}/src/views/ModulesView.vue" || fail "module history previous-page control missing"
grep -q "historyPage + 1" "${ROOT}/src/views/ModulesView.vue" || fail "module history next-page control missing"
grep -q "page_size" "${ROOT}/src/access.js" || fail "session audit helper is not paged"
grep -q "auditTotal" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "session audit total metadata missing"
grep -q "auditPage - 1" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "session audit previous-page control missing"
grep -q "auditPage + 1" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "session audit next-page control missing"
! grep -q "auditLimit" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "legacy audit limit control remains"
echo "history-pagination-ui: PASS"
