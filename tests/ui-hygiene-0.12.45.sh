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
# 0.12.85: the release badge moved into the shared ReleaseTrustBadge block; count both files.
TRUST_FILES=("$UPDATES" "$ROOT/src/components/ReleaseTrustBadge.vue")
COUNT_DESC="$(cat "${TRUST_FILES[@]}" | grep -o 'aria-describedby=' | wc -l)"
[[ "$COUNT_DESC" -ge 2 ]] || fail "trust triggers missing aria-describedby"
COUNT_CLICK="$(cat "${TRUST_FILES[@]}" | grep -oE '@click="(closeTrustPopover\(\$event\)|emit\(.trust-close., \$event\))"' | wc -l)"
[[ "$COUNT_CLICK" -ge 2 ]] || fail "trust popovers do not close on mouse click"
COUNT_ESC="$(cat "${TRUST_FILES[@]}" | grep -oE '@keydown\.esc\.stop\.prevent="(closeTrustPopover\(\$event\)|emit\(.trust-close., \$event\))"' | wc -l)"
[[ "$COUNT_ESC" -ge 2 ]] || fail "trust popovers do not close with Escape"
cat "${TRUST_FILES[@]}" | grep -q 'role="tooltip"' || fail "trust tooltip role missing"

# L69: a client switch clears any pending site debounce, suppresses the watcher caused by clearing search,
# and performs the one immediate fetch itself.
grep -q 'createResourceSiteSearchCoordinator' "$RESOURCES" || fail "client/site search coordinator missing"
grep -A4 'watch(selectedClientId' "$RESOURCES" | grep -q 'siteSearchCoordinator.clientChanged' || fail "client change no longer uses the coordinated immediate site fetch"
grep -q 'watch(siteSearch, () => { siteSearchCoordinator.searchChanged() })' "$RESOURCES" || fail "site-search watcher no longer uses duplicate-load suppression coordinator"

echo "ui-hygiene-0.12.45: PASS"
