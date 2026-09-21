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
grep -q 'role-actionbar' "${ROOT}/src/components/access/RolesPanel.vue" || fail "role action bar missing"
grep -q 'Tactical permissions' "${ROOT}/src/components/access/RolesPanel.vue" || fail "role editor tabs missing"
grep -q 'Search permissions' "${ROOT}/src/components/access/RolesPanel.vue" || fail "role permission search missing"
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
grep -q "apiRaw" "${ROOT}/src/contracts.js" || fail "authenticated contract export must use shared authenticated raw API handling"
if grep -A22 "export async function publicApiFetch" "${ROOT}/src/api.js" | grep -q "invalidateTacticalSession"; then fail "public API must not invalidate Tactical session"; fi
node "${ROOT}/tests/session-expiry.mjs"

# 0.10.1 scheduler hardening UI
grep -q "getSchedulerConfig" "${ROOT}/src/scheduler.js" || fail "scheduler config API missing"
grep -q "runSchedulerSelfTest" "${ROOT}/src/scheduler.js" || fail "scheduler self-test API missing"
grep -q "Configuration & diagnostics" "${ROOT}/src/views/SchedulesView.vue" || fail "scheduler configuration surface missing"
grep -q "Type the schedule name to confirm" "${ROOT}/src/views/SchedulesView.vue" || fail "dangerous Run now confirmation missing"

# 0.10.1 persistent navigation collapse
grep -q "tec_tac_nav_rail_collapsed" "${ROOT}/src/preferences.js" || fail "rail collapse cache/migration persistence missing"
grep -q "tec_tac_nav_sections" "${ROOT}/src/preferences.js" || fail "category collapse cache/migration persistence missing"
grep -q "toggleSection" "${ROOT}/src/App.vue" || fail "category collapse control missing"
grep -q "rail-collapsed" "${ROOT}/src/styles.css" || fail "collapsed rail styling missing"

grep -q 'ignoring stale enabled module state for missing extension' "${ROOT}/scripts/sync-modules.sh" || fail "stale module-state warning missing"
grep -q '/opt/tec-tac/etc/tec-tac.conf' "${ROOT}/scripts/tec-tac-config.sh" || fail "central Tec-Tac config path missing"
grep -q 'UI_SOURCE_ROOT=' "${ROOT}/scripts/install.sh" || fail "UI installer does not preserve its own source root"
if grep -q 'REPO_ROOT=' "${ROOT}/scripts/install.sh"; then fail "UI installer still uses collision-prone REPO_ROOT"; fi
echo "[TEST] PASS layout integration"

grep -q 'npm install --no-package-lock' "${ROOT}/scripts/install.sh" || fail "UI installer may dirty source checkout with package-lock.json"
echo "[TEST] PASS source checkout clean install"

# 0.10.6 dynamic module manifest/cache/route ownership hardening
grep -Fq "fetch('/tec-tac/modules/modules.json', { cache: 'no-store' })" "${ROOT}/src/api.js" || fail "canonical runtime module manifest URL changed"
! grep -Fq "fetch('/tec-tac/modules.json'" "${ROOT}/src/api.js" || fail "legacy root module manifest URL reintroduced"
grep -q 'hashlib.sha256' "${ROOT}/scripts/sync-modules.sh" || fail "module entry content cache key missing"
grep -q '?v={src_key}' "${ROOT}/scripts/sync-modules.sh" || fail "authenticated module cache-busted entry missing"
grep -q '?v={pub_key}' "${ROOT}/scripts/sync-modules.sh" || fail "public module cache-busted entry missing"
grep -q 'guardedModuleRouter' "${ROOT}/src/module-loader.js" || fail "dynamic route ownership guard missing"
grep -q 'dynamicModule: descriptor.id' "${ROOT}/src/module-loader.js" || fail "dynamic route ownership metadata missing"
if grep -Eq "path:[[:space:]]*['\"]/automation|name:[[:space:]]*['\"]extension-automation" "${ROOT}/src/router.js"; then fail "core UI must not own Automation route"; fi
grep -q '/tec-tac/modules/modules.json' "${ROOT}/README.md" || fail "canonical runtime module manifest documentation missing"
grep -q '/var/lib/tec-tac/ui/tec-tac/modules/modules.json' "${ROOT}/README.md" || fail "canonical runtime module manifest filesystem path missing"
echo "[TEST] PASS dynamic module cache and route ownership"

# 0.10.7 lifecycle cache invalidation
grep -q 'location = /tec-tac/index.html' scripts/repair-nginx.sh || fail "index.html cache policy missing"
grep -q 'location = /tec-tac/modules/modules.json' scripts/repair-nginx.sh || fail "module manifest cache policy missing"
grep -q 'Cache-Control "no-store, no-cache, must-revalidate, max-age=0"' scripts/repair-nginx.sh || fail "no-store cache policy missing"
grep -A18 "async function poll" src/views/ModulesView.vue | grep -q 'scheduleReload()' || fail "module lifecycle success does not schedule shell reload"
grep -A22 "async function refreshJob" src/views/SystemUpdatesView.vue | grep -q 'scheduleReload()' || fail "system update success does not schedule shell reload"
echo "[TEST] PASS lifecycle cache invalidation"

# 0.10.8 Core-owned UI context actions
grep -q "createContextActionRegistry" "${ROOT}/src/context-actions.js" || fail "context action registry missing"
grep -q "app.provide('tecTacContextActions'" "${ROOT}/src/main.js" || fail "context action registry not provided by shell"
grep -q "contextActions" "${ROOT}/src/module-loader.js" || fail "context actions not passed to authenticated modules"
grep -q "moduleContextActions?.clear" "${ROOT}/src/module-loader.js" || fail "partial context actions are not cleaned on module registration failure"
grep -q "UI runtime context actions" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts UI context-action section missing"
grep -q "contextActions?.snapshot" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts does not enumerate live UI actions"
[[ -f "${ROOT}/docs/context-actions.md" ]] || fail "context action developer contract missing"
node --check "${ROOT}/src/context-actions.js"
echo "[TEST] PASS UI context action contract"

# 0.10.9 lifecycle progress + delayed refresh
grep -q 'lifecycle-progress' "${ROOT}/src/views/ModulesView.vue" || fail "module lifecycle progress bar missing"
grep -q 'lifecycle-progress' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "system update progress bar missing"
grep -q 'reloadCountdown.value = 5' "${ROOT}/src/views/ModulesView.vue" || fail "module success reload delay missing"
grep -q 'reloadCountdown.value = 5' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "system update success reload delay missing"
grep -q 'reloading in' "${ROOT}/src/views/ModulesView.vue" || fail "module reload countdown label missing"
grep -q 'reloading in' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "system update reload countdown label missing"
grep -q '.lifecycle-progress-track' "${ROOT}/src/styles.css" || fail "lifecycle progress styling missing"
echo "[TEST] PASS lifecycle progress and delayed refresh"

# 0.10.10 Core-owned UI context interactions
grep -q "createContextInteractionRegistry" "${ROOT}/src/context-interactions.js" || fail "context interaction registry missing"
grep -q "app.provide('tecTacContextInteractions'" "${ROOT}/src/main.js" || fail "context interaction registry not provided by shell"
grep -q "contextInteractions" "${ROOT}/src/module-loader.js" || fail "context interactions not passed to authenticated modules"
grep -q "moduleContextInteractions?.clear" "${ROOT}/src/module-loader.js" || fail "partial context interactions are not cleaned on module registration failure"
grep -q "UI runtime context interactions" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts UI context-interaction section missing"
grep -q "contextInteractions?.snapshot" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts does not enumerate live UI interactions"
[[ -f "${ROOT}/docs/context-interactions.md" ]] || fail "context interaction developer contract missing"
node --check "${ROOT}/src/context-interactions.js"
echo "[TEST] PASS UI context interaction contract"


# 0.10.11 authenticated raw/file module API contract
grep -q "export async function apiRaw" "${ROOT}/src/api.js" || fail "apiRaw helper missing"
grep -q "export async function apiBlob" "${ROOT}/src/api.js" || fail "apiBlob helper missing"
grep -q "export async function apiText" "${ROOT}/src/api.js" || fail "apiText helper missing"
grep -q "apiRaw," "${ROOT}/src/main.js" || fail "apiRaw not exposed to authenticated modules"
grep -q "apiBlob," "${ROOT}/src/main.js" || fail "apiBlob not exposed to authenticated modules"
grep -q "apiText," "${ROOT}/src/main.js" || fail "apiText not exposed to authenticated modules"
grep -q "Authenticated module API helpers" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts module API helper section missing"
[[ -f "${ROOT}/docs/module-runtime-api.md" ]] || fail "module runtime API documentation missing"
grep -q "permission_classes = \[IsAuthenticated\]" "${ROOT}/docs/module-runtime-api.md" || fail "DRF IsAuthenticated guidance missing"
grep -q "must not access.*access_token" "${ROOT}/docs/module-runtime-api.md" || fail "token ownership boundary missing"
node "${ROOT}/tests/api-raw.mjs"
echo "[TEST] PASS authenticated raw/file module API contract"

# 0.10.12 per-user navigation ordering, favorites and context menu
grep -q "const sectionOrder = \['Favorites'" "${ROOT}/src/App.vue" || fail "Favorites navigation category missing"
grep -q 'function navDrop' "${ROOT}/src/App.vue" || fail "navigation drag/drop ordering missing"
grep -q 'source.section !== section' "${ROOT}/src/App.vue" || fail "same-category drag guard missing"
grep -q 'function toggleFavorite' "${ROOT}/src/App.vue" || fail "navigation favorite toggle missing"
grep -q 'Open in new tab' "${ROOT}/src/App.vue" || fail "navigation new-tab context action missing"
grep -q "router.resolve(item.to)" "${ROOT}/src/App.vue" || fail "new-tab navigation does not use router resolution"
grep -q 'window.open' "${ROOT}/src/App.vue" || fail "new-tab window action missing"
grep -q 'nav-context-menu' "${ROOT}/src/styles.css" || fail "navigation context-menu styling missing"
grep -q 'Per-user navigation preferences' "${ROOT}/README.md" || fail "navigation preference documentation missing"
echo "[TEST] PASS per-user navigation preferences"


# 0.10.13 navigation fresh-tab route restoration
grep -q "const target = new URL(resolved.href, base)" "${ROOT}/src/App.vue" || fail "new-tab navigation does not construct an absolute Tec-Tac URL"
grep -q "window.location.hash.startsWith('#/')" "${ROOT}/src/main.js" || fail "initial hash target is not preserved"
grep -q "await router.replace(initialHashTarget)" "${ROOT}/src/main.js" || fail "authenticated initial route is not replayed after module registration"
grep -q "fresh tab may target a dynamically registered authenticated route" "${ROOT}/src/main.js" || fail "dynamic fresh-tab route restoration documentation missing"
echo "[TEST] PASS navigation fresh-tab route restoration"

# 0.10.14 module install current -> target version preview
grep -q "row.current_version || 'not installed'" "${ROOT}/src/views/ModulesView.vue" || fail "module install preview does not show installed version"
grep -q "row.version || row.extension_version" "${ROOT}/src/views/ModulesView.vue" || fail "module install preview does not show target version"
grep -q 'current.*target module versions' "${ROOT}/README.md" || fail "module version preview documentation missing"
echo "[TEST] PASS module current-to-target version preview"


# 0.10.15 context-menu new-window startup wording
grep -q "tec_tac_launch.*new-window" "${ROOT}/src/App.vue" || fail "new-window launch marker missing"
grep -q "Opening new window" "${ROOT}/src/App.vue" || fail "new-window startup message missing"
grep -q "Verifying Tactical session" "${ROOT}/src/App.vue" || fail "normal verification startup message missing"
grep -q "searchParams.delete('tec_tac_launch')" "${ROOT}/src/App.vue" || fail "temporary new-window marker is not removed"
echo "[TEST] PASS contextual new-window startup wording"


# 0.10.16 server-backed Core user preferences
[[ -f "${ROOT}/src/preferences.js" ]] || fail "preference state/service missing"
[[ -f "${ROOT}/src/views/PreferencesView.vue" ]] || fail "Preferences page missing"
grep -q "'/api/tfd/ui/preferences/'" "${ROOT}/src/preferences.js" || fail "preference API integration missing"
grep -q 'legacySnapshot' "${ROOT}/src/preferences.js" || fail "legacy local preference migration missing"
grep -q 'initializeUserPreferences' "${ROOT}/src/main.js" || fail "preference startup hydration missing"
grep -q "path: '/preferences'" "${ROOT}/src/router.js" || fail "Preferences route missing"
grep -q 'User preferences' "${ROOT}/src/App.vue" || fail "Preferences user control missing"
grep -q 'updateUserPreferences' "${ROOT}/src/App.vue" || fail "shell navigation is not wired to Core preferences"
grep -q 'server-backed in 0.10.16' "${ROOT}/README.md" || fail "server-backed preference documentation missing"
[[ -f "${ROOT}/docs/user-preferences.md" ]] || fail "user preference developer documentation missing"
node --check "${ROOT}/src/preferences.js"
echo "[TEST] PASS server-backed Core user preferences"

# 0.10.17 Core-owned shared Monaco editor runtime
[[ -f "${ROOT}/src/code-editor.js" ]] || fail "Core code editor service missing"
grep -q '"monaco-editor": "0.52.2"' "${ROOT}/package.json" || fail "Monaco is not a normal Tec-Tac UI dependency"
grep -q "monaco-editor/esm/vs/editor/editor.worker?worker" "${ROOT}/src/code-editor.js" || fail "Monaco editor worker is not Vite-managed"
grep -q "monaco-editor/esm/vs/language/html/html.worker?worker" "${ROOT}/src/code-editor.js" || fail "Monaco HTML worker missing"
grep -q "monaco-editor/esm/vs/language/css/css.worker?worker" "${ROOT}/src/code-editor.js" || fail "Monaco CSS worker missing"
grep -q "monaco-editor/esm/vs/language/json/json.worker?worker" "${ROOT}/src/code-editor.js" || fail "Monaco JSON worker missing"
grep -q "createCodeEditorService" "${ROOT}/src/main.js" || fail "Core editor service not created by shell"
grep -q "app.provide('tecTacCodeEditor'" "${ROOT}/src/main.js" || fail "Core editor service not provided by shell"
grep -q "codeEditor" "${ROOT}/src/module-loader.js" || fail "codeEditor not passed to authenticated modules"
grep -q "moduleCodeEditor?.clear" "${ROOT}/src/module-loader.js" || fail "failed module registration does not clean editor resources"
grep -q "registerCompletionProvider" "${ROOT}/src/code-editor.js" || fail "completion provider extension point missing"
grep -q "registerHoverProvider" "${ROOT}/src/code-editor.js" || fail "hover provider extension point missing"
grep -q "setModel(modelWrapper)" "${ROOT}/src/code-editor.js" || fail "editor model switching missing"
grep -q "saveViewState" "${ROOT}/src/code-editor.js" || fail "editor view-state preservation missing"
grep -q "MutationObserver" "${ROOT}/src/code-editor.js" || fail "editor theme synchronization missing"
grep -q "SUPPORTED_LANGUAGES.*html.*markdown.*plaintext.*css.*yaml.*json" "${ROOT}/src/code-editor.js" || fail "required code editor languages missing"
grep -q "Shared module code editor" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts editor section missing"
[[ -f "${ROOT}/docs/module-code-editor.md" ]] || fail "module code editor developer documentation missing"
[[ -f "${ROOT}/examples/code-editor-reference/ui/index.js" ]] || fail "code editor reference module missing"
grep -q "Replace Selection" "${ROOT}/examples/code-editor-reference/ui/index.js" || fail "reference selection replacement control missing"
grep -q "Switch Language" "${ROOT}/examples/code-editor-reference/ui/index.js" || fail "reference language switching control missing"
node --check "${ROOT}/src/code-editor.js"
node --check "${ROOT}/examples/code-editor-reference/ui/index.js"
echo "[TEST] PASS Core-owned shared Monaco editor runtime"

# 0.11.0 Core dashboards + dashboardWidgets runtime
[[ -f "${ROOT}/src/dashboards.js" ]] || fail "dashboard API client missing"
[[ -f "${ROOT}/src/dashboard-widgets.js" ]] || fail "dashboard widget registry missing"
[[ -f "${ROOT}/src/dashboard-core-widgets.js" ]] || fail "Core dashboard widgets missing"
[[ -f "${ROOT}/docs/module-dashboard-widgets.md" ]] || fail "dashboard widget developer documentation missing"
grep -q "createDashboardWidgetRegistry" "${ROOT}/src/dashboard-widgets.js" || fail "dashboard widget registry factory missing"
grep -q "app.provide('tecTacDashboardWidgets'" "${ROOT}/src/main.js" || fail "dashboard widget registry not provided by shell"
grep -q "dashboardWidgets" "${ROOT}/src/module-loader.js" || fail "dashboard widgets not passed to authenticated modules"
grep -q "moduleDashboardWidgets?.clear" "${ROOT}/src/module-loader.js" || fail "partial dashboard widgets are not cleaned on module registration failure"
grep -q "path: '/dashboards'" "${ROOT}/src/router.js" || fail "dashboard route missing"
grep -q "path: '/dashboards/:dashboardId'" "${ROOT}/src/router.js" || fail "dashboard detail route missing"
grep -q "'/api/tfd/dashboards/'" "${ROOT}/src/dashboards.js" || fail "dashboard API integration missing"
grep -q 'private' "${ROOT}/src/views/DashboardView.vue" || fail "private dashboard option missing"
grep -q 'shared' "${ROOT}/src/views/DashboardView.vue" || fail "shared dashboard option missing"
grep -q 'Set as my default' "${ROOT}/src/views/DashboardView.vue" || fail "default dashboard action missing"
grep -q 'Add Widget' "${ROOT}/src/views/DashboardView.vue" || fail "widget catalogue action missing"
grep -q 'resizeWidget' "${ROOT}/src/views/DashboardView.vue" || fail "dashboard widget resize behavior missing"
grep -q 'dropOn' "${ROOT}/src/views/DashboardView.vue" || fail "dashboard widget drag reorder behavior missing"
grep -q 'last_dashboard_id' "${ROOT}/src/preferences.js" || fail "last dashboard preference missing"
grep -q 'Dashboard widget contributions' "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts dashboard widget section missing"
grep -q "dashboardWidgets?.snapshot" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts does not enumerate dashboard widgets"
grep -q 'rail-search-wrap' "${ROOT}/src/App.vue" || fail "navigation search was not moved into rail"
grep -q 'position:sticky' "${ROOT}/src/styles.css" || fail "sticky navigation/dashboard styling missing"
if grep -q 'class="search".*Search navigation' "${ROOT}/src/App.vue"; then fail "legacy topbar navigation search remains"; fi
node --check "${ROOT}/src/dashboards.js"
node --check "${ROOT}/src/dashboard-widgets.js"
node --check "${ROOT}/src/dashboard-core-widgets.js"
echo "[TEST] PASS Core dashboards and dashboard widget contract"

# 0.11.1 script language modes + module-safe diagnostics providers
grep -q "SUPPORTED_LANGUAGES.*powershell.*bat.*python.*shell.*typescript" "${ROOT}/src/code-editor.js" || fail "script editor language IDs missing"
grep -q "monaco-editor/esm/vs/language/typescript/monaco.contribution" "${ROOT}/src/code-editor.js" || fail "TypeScript Monaco contribution missing"
grep -q "monaco-editor/esm/vs/language/typescript/ts.worker?worker" "${ROOT}/src/code-editor.js" || fail "TypeScript worker is not Vite-managed"
grep -q "registerDiagnosticsProvider(language, provider)" "${ROOT}/src/code-editor.js" || fail "module-scoped diagnostics provider API missing"
grep -q "function registerDiagnosticsProvider" "${ROOT}/src/code-editor.js" || fail "Core diagnostics provider implementation missing"
grep -q "setModelMarkers" "${ROOT}/src/code-editor.js" || fail "Core diagnostics do not translate to Monaco markers"
grep -q "versionId !== model.getVersionId" "${ROOT}/src/code-editor.js" || fail "async stale diagnostics guard missing"
grep -q "tec-tac:.*diagnostics" "${ROOT}/src/code-editor.js" || fail "diagnostics marker ownership is not namespaced"
grep -q "registerDiagnosticsProvider" "${ROOT}/docs/module-code-editor.md" || fail "diagnostics provider documentation missing"
grep -q "powershell" "${ROOT}/docs/module-code-editor.md" || fail "PowerShell language documentation missing"
grep -q "typescript" "${ROOT}/docs/module-code-editor.md" || fail "TypeScript language documentation missing"
grep -q "registerDiagnosticsProvider" "${ROOT}/examples/code-editor-reference/ui/index.js" || fail "reference diagnostics provider missing"
grep -q "registerDiagnosticsProvider" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts diagnostics capability missing"
node --check "${ROOT}/src/code-editor.js"
node --check "${ROOT}/examples/code-editor-reference/ui/index.js"
echo "[TEST] PASS script editor languages and diagnostics provider contract"

# 0.11.2 structured scheduler payload editor + module lifecycle history
[[ -f "${ROOT}/src/components/StructuredObjectEditor.vue" ]] || fail "structured scheduler object editor missing"
grep -q "StructuredObjectEditor" "${ROOT}/src/views/SchedulesView.vue" || fail "Scheduler does not use structured object editor"
! grep -q "Targets (JSON)" "${ROOT}/src/views/SchedulesView.vue" || fail "raw Targets JSON textarea remains"
! grep -q "Parameters (JSON)" "${ROOT}/src/views/SchedulesView.vue" || fail "raw Parameters JSON textarea remains"
grep -q "Advanced JSON" "${ROOT}/src/components/StructuredObjectEditor.vue" || fail "advanced JSON fallback missing"
grep -q "listModuleJobs" "${ROOT}/src/modules.js" || fail "module history API helper missing"
grep -q "activeTab==='history'" "${ROOT}/src/views/ModulesView.vue" || fail "module history tab missing"
grep -q "Requested by" "${ROOT}/src/views/ModulesView.vue" || fail "module history requester column missing"
echo "[TEST] PASS structured scheduler payload editor and module lifecycle history"

# 0.11.7 Core interactive session-security rollout
[[ -f "${ROOT}/src/session-security.js" ]] || fail "Core shell session activity tracker missing"
grep -q "POST\|session/activity" "${ROOT}/src/session-security.js" || fail "session activity endpoint integration missing"
grep -q "activity_heartbeat_seconds" "${ROOT}/src/session-security.js" || fail "server heartbeat policy not consumed"
grep -q "keydown" "${ROOT}/src/session-security.js" || fail "keyboard activity tracking missing"
grep -q "pointerdown" "${ROOT}/src/session-security.js" || fail "pointer activity tracking missing"
if grep -q "mousemove" "${ROOT}/src/session-security.js"; then fail "continuous mousemove activity must not be used"; fi
grep -q "CORE_SESSION_FAILURE_CODES" "${ROOT}/src/api.js" || fail "Core session failure code handling missing"
grep -q "session_idle_timeout" "${ROOT}/src/api.js" || fail "idle timeout failure handling missing"
grep -q "session_absolute_timeout" "${ROOT}/src/api.js" || fail "absolute timeout failure handling missing"
grep -q "session_ip_change" "${ROOT}/src/api.js" || fail "IP change failure handling missing"
grep -q "session_revoked" "${ROOT}/src/api.js" || fail "revoked session failure handling missing"
grep -q "session_invalid_state" "${ROOT}/src/api.js" || fail "invalid session state handling missing"
grep -q "startSessionActivityTracking" "${ROOT}/src/App.vue" || fail "Core shell does not start activity tracker"
node --check "${ROOT}/src/session-security.js"
echo "[TEST] PASS Core interactive session-security rollout"

# 0.11.8 failed lifecycle job polling
grep -Fq "rejectErrorPayload !== false" "${ROOT}/src/api.js" || fail "2xx error-payload compatibility switch missing"
grep -Fq "getModuleJob(jobId){ return apiFetch" "${ROOT}/src/modules.js" || fail "module job API helper missing"
grep -Fq "rejectErrorPayload:false" "${ROOT}/src/modules.js" || fail "failed module jobs must remain readable by poller"
grep -Fq "rejectErrorPayload: false" "${ROOT}/src/api.js" || fail "failed system update jobs must remain readable by poller"
echo "[TEST] PASS terminal lifecycle job polling"

# 0.11.9 lifecycle hardening + package inspection parity
grep -q 'ignoring stale enabled module state for missing extension' "${ROOT}/scripts/sync-modules.sh" || fail "stale module-state degradation missing"
grep -q 'Preflighting extension UI modules against staged deployment' "${ROOT}/scripts/install.sh" || fail "UI module preflight does not happen before live replacement"
grep -q 'STAGE_ROOT=.*tec-tac-ui-stage' "${ROOT}/scripts/install.sh" || fail "staged UI deployment root missing"
grep -q 'PACKAGE INSPECTION' "${ROOT}/src/views/ModulesView.vue" || fail "module package inspection summary missing"
grep -q 'stagedHash' "${ROOT}/src/views/ModulesView.vue" || fail "module package SHA summary missing"
grep -q 'stagedSourceLabel' "${ROOT}/src/views/ModulesView.vue" || fail "module package source summary missing"
grep -q 'systemJobFailureTail' "${ROOT}/src/views/SystemUpdatesView.vue" || fail "terminal system-update failure tail missing"
echo "[TEST] PASS lifecycle hardening and package inspection parity"

# 0.11.12 compact multi-module package inspection grid
grep -q 'module-inspection-grid' "${ROOT}/src/views/ModulesView.vue" || fail "compact module inspection grid missing"
grep -q 'Installed</span><span>Package</span><span>Action</span><span>Source</span><span>SHA256</span><span>Requires' "${ROOT}/src/views/ModulesView.vue" || fail "module inspection columns missing"
grep -q 'intake_sha256' "${ROOT}/src/views/ModulesView.vue" || fail "module package provenance hash mapping missing"
grep -q 'moduleRequirements(row)' "${ROOT}/src/views/ModulesView.vue" || fail "module inspection dependency summary missing"
echo "[TEST] PASS compact multi-module package inspection grid"
