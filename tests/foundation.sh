#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

[[ "$(tr -d '\r\n' < "${ROOT}/VERSION")" == "0.2.3" ]] || fail "VERSION is not 0.2.3"
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
  scripts/sync-modules.sh \
  scripts/repair-nginx.sh; do
  [[ -f "${ROOT}/${f}" ]] || fail "missing ${f}"
done

for needle in "'/v2/checkcreds/'" "'/v2/login/'" "'/accounts/users/setup_totp/'" "'/logout/'"; do
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
grep -q "tacticalAuthStage" "${ROOT}/src/state.js" || fail "setup-token startup guard missing"
grep -q "Verify and sign in" "${ROOT}/src/components/LoginPanel.vue" || fail "TOTP enrollment verification UI missing"
grep -q "loadPublicUiModules" "${ROOT}/src/main.js" || fail "public module bootstrap missing"
grep -q "registerPublic" "${ROOT}/src/module-loader.js" || fail "public module runtime missing"
grep -q "publicApiFetch" "${ROOT}/src/api.js" || fail "public API helper missing"
grep -q "credentials: 'omit'" "${ROOT}/src/api.js" || fail "public API token isolation missing"
grep -q "/public/:pathMatch" "${ROOT}/src/router.js" || fail "public route namespace missing"
grep -q "public.entry" "${ROOT}/scripts/sync-modules.sh" || fail "public UI sync validation missing"


grep -q 'TEC_TAC_UI_DEPLOY_BASE:-/var/lib/tec-tac/ui' "${ROOT}/scripts/install.sh" || fail "persistent UI deployment path missing"
grep -q '/var/lib/tec-tac/ui/tec-tac' "${ROOT}/scripts/sync-modules.sh" || fail "module sync still targets Tactical dist"
grep -q 'sites-available/frontend.conf' "${ROOT}/scripts/repair-nginx.sh" || fail "frontend nginx repair target missing"
grep -q 'nginx -t' "${ROOT}/scripts/repair-nginx.sh" || fail "nginx validation missing"
if grep -q '/var/www/rmm/dist/tec-tac' "${ROOT}/scripts/install.sh"; then fail "installer still deploys under Tactical dist"; fi

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
assert package['version']=='0.2.3'
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
bash -n "${ROOT}/scripts/repair-nginx.sh"
echo "[TEST] PASS foundation"
