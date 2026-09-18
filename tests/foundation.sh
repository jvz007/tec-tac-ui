#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

[[ "$(tr -d '\r\n' < "${ROOT}/VERSION")" == "0.2.1" ]] || fail "VERSION is not 0.2.1"
for f in \
  src/module-loader.js \
  src/views/PublicPendingView.vue \
  src/modules.js \
  src/components/LoginPanel.vue \
  src/components/access/UsersPanel.vue \
  src/components/access/RolesPanel.vue \
  src/components/access/SessionPanel.vue \
  src/components/UnsavedChangesDialog.vue \
  src/unsaved.js \
  scripts/install.sh \
  scripts/sync-modules.sh; do
  [[ -f "${ROOT}/${f}" ]] || fail "missing ${f}"
done

for needle in "'/v2/checkcreds/'" "'/v2/login/'" "'/logout/'"; do
  grep -q "${needle}" "${ROOT}/src/api.js" || fail "Tactical auth endpoint ${needle} missing"
done
grep -q "'/api/tfd/modules/'" "${ROOT}/src/modules.js" || fail "module catalog API missing"
grep -q "modules/packages/inspect/" "${ROOT}/src/modules.js" || fail "module package inspect API missing"
grep -q "discardModulePackage" "${ROOT}/src/modules.js" || fail "staged package cleanup API missing"
grep -q "installModulePackage" "${ROOT}/src/views/ModulesView.vue" || fail "module install UI missing"
grep -q "removeModule" "${ROOT}/src/views/ModulesView.vue" || fail "module remove UI missing"
grep -q "can_do_server_maint" "${ROOT}/src/views/ModulesView.vue" || fail "module management permission explanation missing"
grep -q "ROLE IN FOCUS" "${ROOT}/src/components/access/RolesPanel.vue" || fail "role focus QoL missing"
grep -q "FormData" "${ROOT}/src/api.js" || fail "multipart request handling missing"
grep -q "logoutTacticalSession" "${ROOT}/src/App.vue" || fail "topbar logout missing"
grep -q "loadPublicUiModules" "${ROOT}/src/main.js" || fail "public module bootstrap missing"
grep -q "registerPublic" "${ROOT}/src/module-loader.js" || fail "public module runtime missing"
grep -q "publicApiFetch" "${ROOT}/src/api.js" || fail "public API helper missing"
grep -q "credentials: 'omit'" "${ROOT}/src/api.js" || fail "public API token isolation missing"
grep -q "/public/:pathMatch" "${ROOT}/src/router.js" || fail "public route namespace missing"
grep -q "public.entry" "${ROOT}/scripts/sync-modules.sh" || fail "public UI sync validation missing"

node --check "${ROOT}/src/api.js"
node --check "${ROOT}/src/access.js"
node --check "${ROOT}/src/modules.js"
node --check "${ROOT}/src/unsaved.js"
node --check "${ROOT}/src/state.js"
node --check "${ROOT}/src/main.js"
node --check "${ROOT}/src/module-loader.js"
node --check "${ROOT}/src/router.js"

python3 - "${ROOT}/package.json" "${ROOT}/examples/reference-module/tec_tac_ui.json" <<'PY'
import json,sys
package=json.load(open(sys.argv[1],encoding='utf-8'))
assert package['version']=='0.2.1'
manifest=json.load(open(sys.argv[2],encoding='utf-8'))
assert manifest['id']=='reference'
assert manifest['entry']=='ui/index.js'
assert isinstance(manifest.get('permissions'),list)
assert manifest['public']['entry']=='ui/public.js'
assert manifest['public']['base_path']=='/public/reference'
print('[TEST] package and reference manifest OK')
PY

bash -n "${ROOT}/scripts/install.sh"
bash -n "${ROOT}/scripts/uninstall.sh"
bash -n "${ROOT}/scripts/sync-modules.sh"
echo "[TEST] PASS foundation"
