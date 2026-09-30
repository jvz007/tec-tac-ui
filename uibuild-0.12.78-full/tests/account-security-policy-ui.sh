#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "account-security-policy-ui: FAIL: $*" >&2; exit 1; }

PANEL="${ROOT}/src/components/access/AccountSecurityPanel.vue"
[[ -f "$PANEL" ]] || fail "account security panel missing"

node "${ROOT}/tests/account-security-policy-api.mjs"
node "${ROOT}/tests/account-security-policy-save-flow.mjs"
# U3/L87: exercise the exact composable used by AccountSecurityPanel with the
# real global unsaved-change state and Vue reactivity.
node "${ROOT}/tests/account-security-policy-panel-lifecycle.mjs"

grep -q 'AccountSecurityPanel' "${ROOT}/src/views/AccessView.vue" || fail "Access view does not register account security panel"
grep -q 'useAccountSecurityPolicy' "$PANEL" || fail "panel is not wired to tested account-security lifecycle"
grep -q 'registerUnsaved' "${ROOT}/src/use-account-security-policy.js" || fail "tested lifecycle is not wired to global unsaved state"

echo "account-security-policy-ui: PASS"
