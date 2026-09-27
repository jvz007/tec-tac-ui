#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "account-security-policy-ui: FAIL: $*" >&2; exit 1; }

PANEL="${ROOT}/src/components/access/AccountSecurityPanel.vue"
[[ -f "$PANEL" ]] || fail "account security panel missing"

# L87: exercise the policy transport and unsaved lifecycle as behaviour. These
# tests intentionally fail if the endpoint/method/payload or failed-save
# navigation semantics drift.
node "${ROOT}/tests/account-security-policy-api.mjs"
node "${ROOT}/tests/account-security-policy-save-flow.mjs"

# Keep only the minimum wiring checks that cannot be executed without mounting
# Vue in a browser test harness.
grep -q 'AccountSecurityPanel' "${ROOT}/src/views/AccessView.vue" || fail "Access view does not register account security panel"
grep -q 'persistAccountSecurityPolicy' "$PANEL" || fail "panel is not wired to tested policy save helper"
grep -q 'registerUnsaved' "$PANEL" || fail "panel is not wired to tested unsaved-change lifecycle"

echo "account-security-policy-ui: PASS"
