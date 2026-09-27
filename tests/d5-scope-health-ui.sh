#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "d5 scope health ui: FAIL: $*" >&2; exit 1; }

grep -q "authorizationRevokedState" "$ROOT/src/views/SchedulerSettingsView.vue" || fail "Scheduler health helper is not wired into the view"
grep -q "AuthorizationRevoked" "$ROOT/src/views/SchedulerSettingsView.vue" || fail "AuthorizationRevoked label missing"
grep -q "capabilities.list_clients === true" "$ROOT/src/core-navigation.js" || fail "Clients & Sites navigation is not permission-aware"
node --check "$ROOT/src/core-navigation.js"
node --check "$ROOT/src/scheduler-health.js"
echo "d5 scope health ui: PASS"
