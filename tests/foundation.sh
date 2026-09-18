#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

[[ "$(tr -d '\r\n' < "${ROOT}/VERSION")" == "0.1.4" ]] || fail "VERSION is not 0.1.4"
[[ -f "${ROOT}/src/module-loader.js" ]] || fail "module loader missing"
[[ -f "${ROOT}/src/components/LoginPanel.vue" ]] || fail "login panel missing"
[[ -f "${ROOT}/src/components/UnsavedChangesDialog.vue" ]] || fail "unsaved changes dialog missing"
[[ -f "${ROOT}/src/unsaved.js" ]] || fail "unsaved state helper missing"
[[ -f "${ROOT}/src/components/access/UsersPanel.vue" ]] || fail "users panel missing"
[[ -f "${ROOT}/src/components/access/RolesPanel.vue" ]] || fail "roles panel missing"
[[ -f "${ROOT}/src/components/access/SessionPanel.vue" ]] || fail "session panel missing"
[[ -f "${ROOT}/src/access.js" ]] || fail "access API helpers missing"
[[ -f "${ROOT}/scripts/install.sh" ]] || fail "installer missing"
[[ -f "${ROOT}/scripts/sync-modules.sh" ]] || fail "module sync missing"

for needle in "'/v2/checkcreds/'" "'/v2/login/'" "'/logout/'"; do
  grep -q "${needle}" "${ROOT}/src/api.js" || fail "Tactical auth endpoint ${needle} missing"
done
grep -q "'/accounts/users/'" "${ROOT}/src/access.js" || fail "Tactical user API missing"
grep -q "'/accounts/roles/'" "${ROOT}/src/access.js" || fail "Tactical role API missing"
grep -q "'/api/tfd/access/extensions/'" "${ROOT}/src/access.js" || fail "Tec-Tac permission catalog API missing"
grep -q "logoutTacticalSession" "${ROOT}/src/App.vue" || fail "topbar logout missing"
grep -q "UnsavedChangesDialog" "${ROOT}/src/App.vue" || fail "unsaved dialog not wired into app shell"
grep -q "requestLeave" "${ROOT}/src/views/AccessView.vue" || fail "access tab dirty guard missing"
grep -q "UNSAVED CHANGES" "${ROOT}/src/components/access/RolesPanel.vue" || fail "role dirty banner missing"
grep -q "focusSelectedRole" "${ROOT}/src/components/access/RolesPanel.vue" || fail "new role focus helper missing"
grep -q "beforeunload" "${ROOT}/src/components/access/RolesPanel.vue" || fail "browser dirty guard missing"
grep -q "Save & continue" "${ROOT}/src/components/UnsavedChangesDialog.vue" || fail "save-and-continue action missing"
grep -q "Discard & continue" "${ROOT}/src/components/UnsavedChangesDialog.vue" || fail "discard-and-continue action missing"
grep -q "Stay here" "${ROOT}/src/components/UnsavedChangesDialog.vue" || fail "stay action missing"

for js in api.js access.js state.js main.js module-loader.js router.js unsaved.js; do
  node --check "${ROOT}/src/${js}"
done

python3 - "${ROOT}/package.json" "${ROOT}/examples/reference-module/tec_tac_ui.json" <<'PY'
import json,sys
package=json.load(open(sys.argv[1],encoding='utf-8'))
assert package['version']=='0.1.4'
manifest=json.load(open(sys.argv[2],encoding='utf-8'))
assert manifest['id']=='reference'
assert manifest['entry']=='ui/index.js'
assert isinstance(manifest.get('permissions'),list)
print('[TEST] package and reference manifest OK')
PY

bash -n "${ROOT}/scripts/install.sh"
bash -n "${ROOT}/scripts/uninstall.sh"
bash -n "${ROOT}/scripts/sync-modules.sh"
echo "[TEST] PASS foundation"
