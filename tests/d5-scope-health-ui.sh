#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "d5 scope health ui: FAIL: $*" >&2; exit 1; }

grep -q "authorization_revoked_last_24h" "$ROOT/src/views/SchedulerSettingsView.vue" || fail "AuthorizationRevoked health count not shown"
grep -q "AuthorizationRevoked" "$ROOT/src/views/SchedulerSettingsView.vue" || fail "AuthorizationRevoked label missing"
grep -q "capabilities.list_clients === true" "$ROOT/src/core-navigation.js" || fail "Clients & Sites navigation is not permission-aware"
node --check "$ROOT/src/core-navigation.js"
echo "d5 scope health ui: PASS"
