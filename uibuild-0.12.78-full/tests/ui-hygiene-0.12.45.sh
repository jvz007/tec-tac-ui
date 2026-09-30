#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
fail(){ echo "ui-hygiene-0.12.45: FAIL: $*" >&2; exit 1; }

node "$ROOT/tests/ui-hygiene-0.12.45.mjs"

LOGIN="$ROOT/src/components/LoginPanel.vue"
MFA="$ROOT/src/components/access/MfaRecoveryPanel.vue"
UPDATES="$ROOT/src/views/SystemUpdatesView.vue"
RESOURCES="$ROOT/src/views/ResourcesView.vue"

# L64: every affected surface routes through the tested clipboard helper and exposes an error target.
grep -q "copyTextWithFeedback" "$LOGIN" || fail "LoginPanel clipboard helper missing"
grep -q "copyTextWithFeedback" "$MFA" || fail "MFA recovery clipboard helper missing"
grep -q "copyTextWithFeedback" "$UPDATES" || fail "System Updates clipboard helper missing"

# L68: both trust triggers describe their tooltip and explicitly close on click/Escape.
COUNT_DESC="$(grep -o 'aria-describedby=' "$UPDATES" | wc -l)"
[[ "$COUNT_DESC" -ge 2 ]] || fail "trust triggers missing aria-describedby"
COUNT_CLICK="$(grep -o '@click="closeTrustPopover(\$event)"' "$UPDATES" | wc -l)"
[[ "$COUNT_CLICK" -ge 2 ]] || fail "trust popovers do not close on mouse click"
COUNT_ESC="$(grep -o '@keydown\.esc\.stop\.prevent="closeTrustPopover(\$event)"' "$UPDATES" | wc -l)"
[[ "$COUNT_ESC" -ge 2 ]] || fail "trust popovers do not close with Escape"
grep -q 'role="tooltip"' "$UPDATES" || fail "trust tooltip role missing"

# L69: a client switch clears any pending site debounce, suppresses the watcher caused by clearing search,
# and performs the one immediate fetch itself.
grep -q 'createResourceSiteSearchCoordinator' "$RESOURCES" || fail "client/site search coordinator missing"
grep -A4 'watch(selectedClientId' "$RESOURCES" | grep -q 'siteSearchCoordinator.clientChanged' || fail "client change no longer uses the coordinated immediate site fetch"
grep -q 'watch(siteSearch, () => { siteSearchCoordinator.searchChanged() })' "$RESOURCES" || fail "site-search watcher no longer uses duplicate-load suppression coordinator"

echo "ui-hygiene-0.12.45: PASS"
