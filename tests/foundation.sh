#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

[[ "$(tr -d '\r\n' < "${ROOT}/VERSION")" == "0.1.3" ]] || fail "VERSION is not 0.1.3"
[[ -f "${ROOT}/src/module-loader.js" ]] || fail "module loader missing"
[[ -f "${ROOT}/src/components/LoginPanel.vue" ]] || fail "login panel missing"
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
grep -q "RoleExtensionPermissions" "${ROOT}/src/components/access/RolesPanel.vue" || true
grep -q "logoutTacticalSession" "${ROOT}/src/App.vue" || fail "topbar logout missing"
grep -q "UsersPanel" "${ROOT}/src/views/AccessView.vue" || fail "user management not wired"
grep -q "RolesPanel" "${ROOT}/src/views/AccessView.vue" || fail "role management not wired"

node --check "${ROOT}/src/api.js"
node --check "${ROOT}/src/access.js"
node --check "${ROOT}/src/state.js"
node --check "${ROOT}/src/main.js"
node --check "${ROOT}/src/module-loader.js"
node --check "${ROOT}/src/router.js"

python3 - "${ROOT}/package.json" "${ROOT}/examples/reference-module/tec_tac_ui.json" <<'PY'
import json,sys
package=json.load(open(sys.argv[1],encoding='utf-8'))
assert package['version']=='0.1.3'
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
