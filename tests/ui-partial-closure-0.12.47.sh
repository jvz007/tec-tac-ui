#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
fail(){ echo "ui-partial-closure-0.12.47: FAIL: $*" >&2; exit 1; }
LOGIN="$ROOT/src/components/LoginPanel.vue"
MFA="$ROOT/src/components/access/MfaRecoveryPanel.vue"
UPDATES="$ROOT/src/views/SystemUpdatesView.vue"
RESOURCES="$ROOT/src/views/ResourcesView.vue"
SCHEDULES="$ROOT/src/views/SchedulesView.vue"

node "$ROOT/tests/ui-partial-closure-0.12.47.mjs"

# Production surfaces must use the behaviorally tested helpers.
grep -q 'copyTextWithFeedback' "$LOGIN" || fail 'LoginPanel feedback helper missing'
grep -q 'copyTextWithFeedback' "$MFA" || fail 'MFA recovery feedback helper missing'
grep -q 'copyTextWithFeedback' "$UPDATES" || fail 'System Updates feedback helper missing'
grep -q 'trustPopoverTransition' "$UPDATES" || fail 'trust popover state helper missing'
grep -q ':aria-describedby=' "$UPDATES" || fail 'trust trigger aria-describedby missing'
grep -q 'role="tooltip"' "$UPDATES" || fail 'trust tooltip semantics missing'
grep -q '@click="closeTrustPopover(\$event)"' "$UPDATES" || fail 'click close missing'
grep -q '@keydown\.esc\.stop\.prevent="closeTrustPopover(\$event)"' "$UPDATES" || fail 'Escape close missing'
grep -q 'clientChangeSiteSearchState' "$RESOURCES" || fail 'client-change search gate missing'
grep -q 'consumeSiteSearchSuppression' "$RESOURCES" || fail 'search suppression consumption missing'
grep -q 'loadScheduleHistoryPage' "$SCHEDULES" || fail 'Scheduler history loader helper missing'
LOAD_LINE="$(grep 'async function loadRunHistory' "$SCHEDULES")"
[[ "$LOAD_LINE" != *'error.value'* ]] || fail 'history loader still writes unrelated Scheduler error state'

echo 'ui-partial-closure-0.12.47: PASS'
