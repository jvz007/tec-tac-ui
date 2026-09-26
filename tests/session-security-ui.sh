#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

[[ -f "${ROOT}/src/components/access/SessionSecurityPanel.vue" ]] || fail "Core Session Security panel missing"
grep -q "SessionSecurityPanel" "${ROOT}/src/views/AccessView.vue" || fail "Access view does not register Session Security panel"
grep -q "session-security" "${ROOT}/src/views/AccessView.vue" || fail "Access Session Security tab missing"
grep -q "getCoreSessionPolicy" "${ROOT}/src/access.js" || fail "session policy API helper missing"
grep -q "updateCoreSessionPolicy" "${ROOT}/src/access.js" || fail "session policy update helper missing"
grep -q "listCoreSessions" "${ROOT}/src/access.js" || fail "Core trusted session list helper missing"
grep -q "revokeCoreSession" "${ROOT}/src/access.js" || fail "Core trusted session revoke helper missing"
grep -q "getCoreSessionAudit" "${ROOT}/src/access.js" || fail "Core session audit helper missing"
grep -q "getCoreSessionDiagnostics" "${ROOT}/src/access.js" || fail "Core session diagnostics helper missing"
grep -q "/api/tfd/session/policy/" "${ROOT}/src/access.js" || fail "Core session policy endpoint missing"
grep -q "/api/tfd/session/sessions/" "${ROOT}/src/access.js" || fail "Core trusted session endpoint missing"
grep -q "/api/tfd/session/audit/" "${ROOT}/src/access.js" || fail "Core session audit endpoint missing"
grep -q "/api/tfd/session/diagnostics/" "${ROOT}/src/access.js" || fail "Core session diagnostics endpoint missing"
grep -q "registerUnsaved" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "policy dirty-state guard missing"
grep -q "modal-backdrop" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "native Core revoke confirmation missing"
! grep -q "window.confirm" "${ROOT}/src/components/access/SessionSecurityPanel.vue" || fail "Session Security must not use browser confirmation dialogs"
echo "[TEST] PASS Core Session Security UI"
