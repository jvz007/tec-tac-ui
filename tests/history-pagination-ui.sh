#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "history-pagination-ui: FAIL: $*" >&2; exit 1; }
grep -q "page_size" "${ROOT}/src/modules.js" || fail "module history helper is not paged"
# 0.12.118: the History tab is src/components/modules/ModuleJobHistory.vue; it pages with the route's page and page_size.
HIST="${ROOT}/src/components/modules/ModuleJobHistory.vue"
grep -q "meta.value.total" "${HIST}" || fail "module history total metadata missing"
grep -q "meta.page - 1" "${HIST}" || fail "module history previous-page control missing"
grep -q "meta.page + 1" "${HIST}" || fail "module history next-page control missing"
grep -q "page_size" "${ROOT}/src/access.js" || fail "session audit helper is not paged"
grep -q "auditTotal" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "session audit total metadata missing"
grep -q "auditPage - 1" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "session audit previous-page control missing"
grep -q "auditPage + 1" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "session audit next-page control missing"
! grep -q "auditLimit" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "legacy audit limit control remains"
echo "history-pagination-ui: PASS"
