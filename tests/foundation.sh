#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

VERSION="$(tr -d '\r\n' < "${ROOT}/VERSION")"
PACKAGE_VERSION="$(python3 - "${ROOT}/package.json" <<'PY_VERSION'
import json,sys
print(json.load(open(sys.argv[1],encoding='utf-8'))['version'])
PY_VERSION
)"
MANIFEST_VERSION="$(python3 - "${ROOT}/tec_tac_package.json" <<'PY_MANIFEST'
import json,sys
print(json.load(open(sys.argv[1],encoding='utf-8'))['version'])
PY_MANIFEST
)"
[[ "${PACKAGE_VERSION}" == "${VERSION}" ]] || fail "package.json (${PACKAGE_VERSION}) does not match VERSION (${VERSION})"
[[ "${MANIFEST_VERSION}" == "${VERSION}" ]] || fail "tec_tac_package.json (${MANIFEST_VERSION}) does not match VERSION (${VERSION})"
for f in \
  src/module-loader.js \
  src/views/PublicPendingView.vue \
  src/views/SystemUpdatesView.vue \
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
grep -q 'fetchTacticalTotpQr' "${ROOT}/src/api.js" || fail "TOTP QR helper missing"
grep -q '/api/tfd/auth/totp/qr/' "${ROOT}/src/api.js" || fail "Tec-Tac TOTP QR endpoint missing"
grep -q 'totp-qr-image' "${ROOT}/src/components/LoginPanel.vue" || fail "TOTP QR image UI missing"
grep -q "'/api/tfd/modules/v2/'" "${ROOT}/src/modules.js" || fail "module v2 catalog API missing"
grep -q "modules/v2/packages/inspect/" "${ROOT}/src/modules.js" || fail "module v2 package inspect API missing"
grep -q "setModuleEnabled" "${ROOT}/src/modules.js" || fail "module enable/disable API missing"
grep -q "installModuleArtifact" "${ROOT}/src/views/ModulesView.vue" || fail "module v2 install UI missing"
grep -q "removeModule" "${ROOT}/src/views/ModulesView.vue" || fail "module remove UI missing"
grep -q "cascade" "${ROOT}/src/views/ModulesView.vue" || fail "cascade disable UI missing"
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



grep -q '/api/tfd/system/updates/' "${ROOT}/src/api.js" || fail "system update API missing"
grep -q "'/system/updates'" "${ROOT}/src/router.js" || fail "system update route missing"
grep -q 'Unlock branch sources' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "advanced branch unlock UI missing"
grep -q 'Upload offline package' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "offline package update UI missing"
grep -q "section: 'Administration'" "${ROOT}/src/App.vue" || fail "grouped administration navigation missing"
grep -q 'tec-tac-config.sh' "${ROOT}/scripts/install.sh" || fail "shared Tec-Tac config loader missing"
grep -q 'TEC_TAC_UI_DEPLOY_ROOT' "${ROOT}/scripts/sync-modules.sh" || fail "module sync does not use configured UI deployment root"
grep -q 'module-state.json' "${ROOT}/scripts/sync-modules.sh" || fail "module enabled-state sync missing"
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

python3 - "${ROOT}/package.json" "${ROOT}/examples/reference-module/tec_tac_ui.json" "${VERSION}" <<'PY'
import json,sys
package=json.load(open(sys.argv[1],encoding='utf-8'))
assert package['version']==sys.argv[3]
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
grep -q 'Drag & drop an offline system update here' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "system update drag/drop package intake missing"
grep -q 'Inspect package' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "system update explicit inspect action missing"
echo "[TEST] PASS foundation"

grep -q 'drop-zone' "${ROOT}/src/views/ModulesView.vue" || fail "drag/drop package intake missing"
grep -q 'discardModuleArtifact' "${ROOT}/src/modules.js" || fail "v2 staged discard API missing"
grep -q '__TEC_TAC_UI_VERSION__' "${ROOT}/src/App.vue" || fail "dynamic footer UI version missing"
grep -q 'const uiVersion = __TEC_TAC_UI_VERSION__' "${ROOT}/src/components/LoginPanel.vue" || fail "dynamic login UI version missing"
grep -q '{{ uiVersion }}' "${ROOT}/src/components/LoginPanel.vue" || fail "login UI version binding missing"
if grep -q '<span>UI</span><b>0.3.0</b>' "${ROOT}/src/components/LoginPanel.vue"; then fail "stale hardcoded login UI version remains"; fi
grep -q '__TEC_TAC_UI_VERSION__' "${ROOT}/vite.config.js" || fail "Vite UI version injection missing"

grep -q 'setModuleVisible' "${ROOT}/src/modules.js" || fail "module visibility API helper missing"
grep -q 'descriptor.visible === false' "${ROOT}/src/module-loader.js" || fail "hidden module navigation suppression missing"
grep -q 'runtime.addNavigation({ ...item, visible: true })' "${ROOT}/src/module-loader.js" || fail "operator visibility override normalization missing"
grep -q 'effective_visible=visible(mid,payload)' "${ROOT}/scripts/sync-modules.sh" || fail "module visibility manifest sync missing"
grep -q 'navigation\["visible"\]=effective_visible' "${ROOT}/scripts/sync-modules.sh" || fail "module visibility override normalization missing"
grep -q '>Hide<' "${ROOT}/src/views/ModulesView.vue" || fail "module hide control missing"
grep -q '>Show<' "${ROOT}/src/views/ModulesView.vue" || fail "module show control missing"

grep -q 'moduleLoadDiagnostic' "${ROOT}/src/views/ModulesView.vue" || fail "module UI load diagnostics missing"
grep -q 'Authenticated UI failed to load' "${ROOT}/src/views/ModulesView.vue" || fail "module UI failure detail missing"
grep -q 'module-load-summary' "${ROOT}/src/views/ModulesView.vue" || fail "module UI load failure summary missing"

# 0.7.0 online repository/catalog UI
grep -q 'listModuleRepositories' "${ROOT}/src/modules.js" || fail "module repository API helpers missing"
grep -q 'listOnlineModuleCatalog' "${ROOT}/src/modules.js" || fail "online module catalog API helper missing"
grep -q 'stageOnlineModulePackage' "${ROOT}/src/modules.js" || fail "online module staging API helper missing"
grep -q 'Online catalog' "${ROOT}/src/views/ModulesView.vue" || fail "online catalog tab missing"
grep -q 'Repositories' "${ROOT}/src/views/ModulesView.vue" || fail "repository management tab missing"
grep -q 'Sync repositories' "${ROOT}/src/views/ModulesView.vue" || fail "repository sync UI missing"


# 0.8.0 scheduler UI
grep -q "'/api/tfd/scheduler/actions/'" "${ROOT}/src/scheduler.js" || fail "scheduler actions API missing"
grep -q "'/schedules'" "${ROOT}/src/router.js" || fail "scheduler route missing"
grep -q "FRAMEWORK SCHEDULER" "${ROOT}/src/views/SchedulesView.vue" || fail "scheduler workspace missing"
grep -q "Run now" "${ROOT}/src/views/SchedulesView.vue" || fail "scheduler run-now UI missing"
node --check "${ROOT}/src/scheduler.js"

# 0.9.x developer contract catalog
grep -q "'/api/tfd/contracts/'" "${ROOT}/src/contracts.js" || fail "developer contract catalog API missing"
grep -q "contracts/export/" "${ROOT}/src/contracts.js" || fail "developer contract export API missing"
grep -q "export_format=" "${ROOT}/src/contracts.js" || fail "developer contract export must use non-reserved export_format query parameter"
! grep -q "contracts/export/?format=" "${ROOT}/src/contracts.js" || fail "developer contract export still uses DRF-reserved format query parameter"
grep -q "'/contracts'" "${ROOT}/src/router.js" || fail "developer contract route missing"
grep -q "Public Contracts" "${ROOT}/src/views/ContractsView.vue" || fail "developer contracts workspace missing"
grep -q "Export Markdown" "${ROOT}/src/views/ContractsView.vue" || fail "markdown export control missing"
grep -q "Export Text" "${ROOT}/src/views/ContractsView.vue" || fail "text export control missing"
node --check "${ROOT}/src/contracts.js"

# 0.9.2 contract export Accept-header regression
grep -Fq "Accept:'*/*'" "${ROOT}/src/contracts.js" || fail "contract export must use neutral Accept header"
grep -q 'export_format=' "${ROOT}/src/contracts.js" || fail "contract export must use export_format selector"


# 0.10.1 Tactical session-expiry contract
grep -q "TACTICAL_SESSION_INVALID_EVENT" "${ROOT}/src/api.js" || fail "session invalidation event missing"
grep -q "invalidateTacticalSession" "${ROOT}/src/api.js" || fail "session invalidation helper missing"
grep -q "response.status === 401" "${ROOT}/src/api.js" || fail "authenticated 401 invalidation missing"
grep -q "TACTICAL_SESSION_INVALID_EVENT" "${ROOT}/src/state.js" || fail "state invalidation listener missing"
grep -q "invalidateTacticalSession" "${ROOT}/src/contracts.js" || fail "authenticated contract export 401 handling missing"
if grep -A22 "export async function publicApiFetch" "${ROOT}/src/api.js" | grep -q "invalidateTacticalSession"; then fail "public API must not invalidate Tactical session"; fi
node "${ROOT}/tests/session-expiry.mjs"

# 0.10.1 scheduler hardening UI
grep -q "getSchedulerConfig" "${ROOT}/src/scheduler.js" || fail "scheduler config API missing"
grep -q "runSchedulerSelfTest" "${ROOT}/src/scheduler.js" || fail "scheduler self-test API missing"
grep -q "Configuration & diagnostics" "${ROOT}/src/views/SchedulesView.vue" || fail "scheduler configuration surface missing"
grep -q "Type the schedule name to confirm" "${ROOT}/src/views/SchedulesView.vue" || fail "dangerous Run now confirmation missing"

# 0.10.1 persistent navigation collapse
grep -q "tec_tac_nav_rail_collapsed" "${ROOT}/src/App.vue" || fail "rail collapse persistence missing"
grep -q "tec_tac_nav_sections" "${ROOT}/src/App.vue" || fail "category collapse persistence missing"
grep -q "toggleSection" "${ROOT}/src/App.vue" || fail "category collapse control missing"
grep -q "rail-collapsed" "${ROOT}/src/styles.css" || fail "collapsed rail styling missing"

grep -q 'module state references enabled module(s) whose extension files are missing' "${ROOT}/scripts/sync-modules.sh" || fail "module-loss guard missing"
grep -q '/opt/tec-tac/etc/tec-tac.conf' "${ROOT}/scripts/tec-tac-config.sh" || fail "central Tec-Tac config path missing"
grep -q 'UI_SOURCE_ROOT=' "${ROOT}/scripts/install.sh" || fail "UI installer does not preserve its own source root"
if grep -q 'REPO_ROOT=' "${ROOT}/scripts/install.sh"; then fail "UI installer still uses collision-prone REPO_ROOT"; fi
echo "[TEST] PASS layout integration"
