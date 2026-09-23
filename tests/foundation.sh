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
grep -q "section: 'Administration'" "${ROOT}/src/core-navigation.js" || fail "grouped administration navigation missing"
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
grep -q 'visible: descriptor.visible !== false' "${ROOT}/src/module-loader.js" || fail "hidden module navigation suppression missing"
grep -q 'moduleId: descriptor.id' "${ROOT}/src/module-loader.js" || fail "operator visibility ownership metadata missing"
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
grep -q "OPERATIONS / CORE SCHEDULER" "${ROOT}/src/views/SchedulesView.vue" || fail "scheduler workspace missing"
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
[[ -f "${ROOT}/src/views/SchedulerSettingsView.vue" ]] || fail "Scheduler administration view missing"
grep -q "Scheduler Configuration" "${ROOT}/src/views/SchedulerSettingsView.vue" || fail "scheduler configuration surface missing"
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
grep -q "\['Favorites', ...savedSections" "${ROOT}/src/App.vue" || fail "Favorites navigation category missing"
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
grep -q 'Installed</span><span>Package</span><span>Trust</span><span>Action</span><span>Source</span><span>SHA256</span><span>Requires' "${ROOT}/src/views/ModulesView.vue" || fail "module inspection columns missing"
grep -q 'intake_sha256' "${ROOT}/src/views/ModulesView.vue" || fail "module package provenance hash mapping missing"
grep -q 'moduleRequirements(row)' "${ROOT}/src/views/ModulesView.vue" || fail "module inspection dependency summary missing"
echo "[TEST] PASS compact multi-module package inspection grid"

# 0.11.13 per-user Quick Actions bar + module contribution contract
[[ -f "${ROOT}/src/quick-actions.js" ]] || fail "Core Quick Actions registry missing"
[[ -f "${ROOT}/src/components/QuickActionsDialog.vue" ]] || fail "Quick Actions manager dialog missing"
[[ -f "${ROOT}/docs/module-quick-actions.md" ]] || fail "Quick Actions module documentation missing"
grep -q "createQuickActionRegistry" "${ROOT}/src/main.js" || fail "Quick Actions registry not created by shell"
grep -q "app.provide('tecTacQuickActions'" "${ROOT}/src/main.js" || fail "Quick Actions registry not provided by shell"
grep -q "quickActions: moduleQuickActions" "${ROOT}/src/module-loader.js" || fail "module-scoped Quick Actions contract not passed to modules"
grep -q "moduleQuickActions?.clear" "${ROOT}/src/module-loader.js" || fail "failed module registration does not clean Quick Actions"
grep -q "extensions.core.quick_actions" "${ROOT}/docs/module-quick-actions.md" || fail "Quick Actions preference storage contract missing"
grep -q "quick-actions-topbar" "${ROOT}/src/App.vue" || fail "top-bar Quick Actions surface missing"
grep -q "quick-action-manage" "${ROOT}/src/App.vue" || fail "Quick Actions manager trigger missing"
grep -q "quickActions.pin" "${ROOT}/docs/module-quick-actions.md" || fail "parameterized module pin contract missing"
grep -q "Quick Action contributions" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts Quick Actions discovery missing"
node --check "${ROOT}/src/quick-actions.js"
echo "[TEST] PASS per-user Quick Actions contract"

# 0.11.14 module-owned executable Quick Actions only
! grep -q "pinRoute" "${ROOT}/src/quick-actions.js" || fail "navigation routes must not be Quick Actions"
! grep -q "isRoutePinned" "${ROOT}/src/quick-actions.js" || fail "route-pin compatibility API must not remain public"
! grep -q "Add to Quick Actions" "${ROOT}/src/App.vue" || fail "navigation context menu still exposes Quick Actions"
! grep -q "availableRoutes" "${ROOT}/src/components/QuickActionsDialog.vue" || fail "Quick Actions manager still offers pages"
grep -q "row.type === 'action'" "${ROOT}/src/quick-actions.js" || fail "legacy non-action pins are not filtered"
grep -q "await quickActions.executePin(pin.id)" "${ROOT}/src/App.vue" || fail "top-bar action invocation missing"
grep -q "Quick Actions exist only for registered module functions" "${ROOT}/docs/module-quick-actions.md" || fail "module ownership boundary documentation missing"
echo "[TEST] PASS module-owned executable Quick Actions"

# 0.11.15 managed module hotfix UI
for token in inspectModuleHotfix applyModuleHotfix getModuleHotfixJob listModuleHotfixes rollbackModuleHotfix; do
  grep -q "$token" "${ROOT}/src/modules.js" || fail "managed hotfix API helper missing: $token"
done
grep -q "activeTab==='hotfixes'" "${ROOT}/src/views/ModulesView.vue" || fail "Module Manager Hotfixes tab missing"
grep -q 'Apply hotfix' "${ROOT}/src/views/ModulesView.vue" || fail "managed hotfix apply action missing"
grep -q 'Rollback' "${ROOT}/src/views/ModulesView.vue" || fail "managed hotfix rollback action missing"
grep -q 'sha256_before' "${ROOT}/src/views/ModulesView.vue" || fail "managed hotfix before-hash inspection missing"
echo "[TEST] PASS managed module hotfix UI"

# 0.11.16 24-hour System Updates release cache integration
grep -q "checkOnlineSystemUpdate(component, { force = false } = {})" "${ROOT}/src/api.js" || fail "system update API force-cache contract missing"
grep -q "status.value?.release_cache?.\[component\]" "${ROOT}/src/views/SystemUpdatesView.vue" || fail "System Updates does not hydrate cached release versions"
grep -q "refreshStableReleases" "${ROOT}/src/views/SystemUpdatesView.vue" || fail "automatic stable release refresh missing"
grep -q "60 \* 60 \* 1000" "${ROOT}/src/views/SystemUpdatesView.vue" || fail "hourly cache-age recheck timer missing"
grep -q "Refresh stable release" "${ROOT}/src/views/SystemUpdatesView.vue" || fail "forced manual stable release refresh missing"
echo "[TEST] PASS System Updates 24-hour release cache"

# 0.11.17 Core-owned module notifications / toast contract
[[ -f "${ROOT}/src/notifications.js" ]] || fail "Core notification service missing"
[[ -f "${ROOT}/docs/module-notifications.md" ]] || fail "module notification documentation missing"
grep -q "createNotificationService" "${ROOT}/src/main.js" || fail "notification service not created by shell"
grep -q "app.provide('tecTacNotifications'" "${ROOT}/src/main.js" || fail "notification service not provided by shell"
grep -q "notifications: moduleNotifications" "${ROOT}/src/module-loader.js" || fail "module-scoped notification contract not passed to modules"
grep -q "moduleNotifications?.clear" "${ROOT}/src/module-loader.js" || fail "failed module registration does not clean notifications"
grep -q "toast-stack" "${ROOT}/src/App.vue" || fail "Core toast surface missing"
grep -q "dedupeKey" "${ROOT}/src/notifications.js" || fail "notification deduplication missing"
grep -q "MAX_VISIBLE = 5" "${ROOT}/src/notifications.js" || fail "notification flood cap missing"
grep -q "Module notifications / toasts" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts notification documentation missing"
node --check "${ROOT}/src/notifications.js"
echo "[TEST] PASS Core-owned module notifications"

# 0.11.18 Core module availability runtime
[[ -f "${ROOT}/src/module-status.js" ]] || fail "module availability runtime missing"
[[ -f "${ROOT}/docs/module-status.md" ]] || fail "module availability documentation missing"
grep -q "createModuleStatusService" "${ROOT}/src/main.js" || fail "module availability service not created by shell"
grep -q "app.provide('tecTacModules'" "${ROOT}/src/main.js" || fail "module availability service not provided by shell"
grep -q "modules," "${ROOT}/src/main.js" || fail "module availability service not passed to module loader runtime"
grep -q "isActive(moduleId)" "${ROOT}/src/module-status.js" || fail "modules.isActive missing"
grep -q "isInstalled(moduleId)" "${ROOT}/src/module-status.js" || fail "modules.isInstalled missing"
grep -q "satisfies(moduleId, constraint)" "${ROOT}/src/module-status.js" || fail "module version constraint helper missing"
grep -q "Module availability runtime" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts module runtime section missing"
node --check "${ROOT}/src/module-status.js"
echo "[TEST] PASS Core module availability runtime"

# 0.12.0 cross-module resource views + navigation search clear
[[ -f "${ROOT}/src/resource-views.js" ]] || fail "Core resource view registry missing"
[[ -f "${ROOT}/docs/module-resource-views.md" ]] || fail "resource view developer documentation missing"
grep -q "createResourceViewRegistry" "${ROOT}/src/main.js" || fail "resource view registry not created by shell"
grep -q "app.provide('tecTacResourceViews'" "${ROOT}/src/main.js" || fail "resource view registry not provided by shell"
grep -q "resourceViews: moduleResourceViews" "${ROOT}/src/module-loader.js" || fail "module-scoped resource view registry not passed to modules"
grep -q "moduleResourceViews?.clear" "${ROOT}/src/module-loader.js" || fail "failed module registration does not clean resource views"
grep -q "Resource view contributions" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts resource view section missing"
grep -q 'class="rail-search-clear"' "${ROOT}/src/App.vue" || fail "navigation search clear button missing"
grep -q "@keydown.esc.stop.prevent=\"query=''\"" "${ROOT}/src/App.vue" || fail "Escape-to-clear navigation search missing"
node --check "${ROOT}/src/resource-views.js"
echo "[TEST] PASS resource view contributions and navigation search clear"


# 0.12.1 Scheduler UI separation + canonical module look and feel
[[ -f "${ROOT}/src/views/SchedulerSettingsView.vue" ]] || fail "Scheduler Configuration page missing"
[[ -f "${ROOT}/docs/ui-design-standards.md" ]] || fail "canonical UI design standards missing"
grep -q "path: '/system/scheduler'" "${ROOT}/src/router.js" || fail "Scheduler Configuration route missing"
grep -q "Scheduler Configuration.*Administration" "${ROOT}/src/core-navigation.js" || fail "Scheduler Configuration administration navigation missing"
grep -q "Run history" "${ROOT}/src/views/SchedulesView.vue" || fail "Scheduler run-history workspace tab missing"
grep -q "Filter schedules" "${ROOT}/src/views/SchedulesView.vue" || fail "Scheduler filter UX missing"
grep -q "deleteConfirm" "${ROOT}/src/views/SchedulesView.vue" || fail "Scheduler delete confirmation modal missing"
! grep -q "getSchedulerConfig" "${ROOT}/src/views/SchedulesView.vue" || fail "operational Scheduler view must not load configuration"
! grep -q "getSchedulerHealth" "${ROOT}/src/views/SchedulesView.vue" || fail "operational Scheduler view must not load diagnostics"
grep -q "getSchedulerConfig" "${ROOT}/src/views/SchedulerSettingsView.vue" || fail "Scheduler Configuration does not load config"
grep -q "getSchedulerHealth" "${ROOT}/src/views/SchedulerSettingsView.vue" || fail "Scheduler Configuration does not load health"
grep -q "Do not use .*window.alert.*window.confirm.*window.prompt" "${ROOT}/docs/ui-design-standards.md" || fail "module native-dialog prohibition missing"
grep -q "Data-display dialog" "${ROOT}/docs/ui-design-standards.md" || fail "data-display dialog standard missing"
grep -q "Input/action dialog" "${ROOT}/docs/ui-design-standards.md" || fail "input/action dialog standard missing"
grep -q "Use the Core .*subtabs.* visual pattern" "${ROOT}/docs/ui-design-standards.md" || fail "tab visual contract missing"
echo "[TEST] PASS Scheduler separation and canonical module UI standards"

# 0.12.2 Scheduler full-width workspace
grep -q ':class="{ .has-editor.: editing }"' "${ROOT}/src/views/SchedulesView.vue" || fail "Scheduler layout does not toggle editor split"
grep -q '\.schedule-layout{[^}]*grid-template-columns:minmax(0,1fr)' "${ROOT}/src/styles.css" || fail "Scheduler default layout is not full width"
grep -q '\.schedule-layout.has-editor{grid-template-columns:minmax(0,1fr) 380px}' "${ROOT}/src/styles.css" || fail "Scheduler editor split layout missing"
grep -q '\.schedule-layout \.tablewrap{width:100%}' "${ROOT}/src/styles.css" || fail "Scheduler table wrapper is not full width"
echo "[TEST] PASS Scheduler full-width workspace"


# 0.12.3 per-user category ordering + Module Manager Open action
[[ -f "${ROOT}/src/views/MenuLayoutView.vue" ]] || fail "Menu Layout page missing"
[[ -f "${ROOT}/src/core-navigation.js" ]] || fail "shared Core navigation catalog missing"
grep -q "path: '/preferences/menu-layout'" "${ROOT}/src/router.js" || fail "Menu Layout route missing"
grep -q 'section_order' "${ROOT}/src/preferences.js" || fail "section order preference missing"
grep -q 'DEFAULT_SECTION_ORDER' "${ROOT}/src/App.vue" || fail "shell does not consume persisted section order"
grep -q 'Save layout' "${ROOT}/src/views/MenuLayoutView.vue" || fail "Menu Layout save action missing"
grep -q 'itemDrop' "${ROOT}/src/views/MenuLayoutView.vue" || fail "Menu Layout item drag/drop missing"
grep -q 'sectionDrop' "${ROOT}/src/views/MenuLayoutView.vue" || fail "Menu Layout category drag/drop missing"
grep -q 'moduleId: descriptor.id' "${ROOT}/src/module-loader.js" || fail "module navigation ownership metadata missing"
grep -q 'selectedNavigation' "${ROOT}/src/views/ModulesView.vue" || fail "Module Manager route discovery missing"
grep -q '>Open</button>' "${ROOT}/src/views/ModulesView.vue" || fail "Module Manager Open action missing"
node --check "${ROOT}/src/core-navigation.js"
node --check "${ROOT}/src/preferences.js"
echo "[TEST] PASS Menu Layout and Module Manager Open action"

# 0.12.4 Core Help + Knowledge Base and module article contract
[[ -f "${ROOT}/src/help.js" ]] || fail "Core Help service missing"
[[ -f "${ROOT}/src/help/core-articles.js" ]] || fail "Core Help article registry missing"
[[ -f "${ROOT}/src/components/HelpDrawer.vue" ]] || fail "contextual Help drawer missing"
[[ -f "${ROOT}/src/components/MarkdownContent.vue" ]] || fail "safe Help Markdown renderer component missing"
[[ -f "${ROOT}/src/views/HelpView.vue" ]] || fail "Knowledge Base view missing"
[[ -f "${ROOT}/docs/module-help.md" ]] || fail "module Help developer contract missing"
grep -q "createHelpService" "${ROOT}/src/main.js" || fail "Core Help service not created by shell"
grep -q "registerCoreHelpArticles" "${ROOT}/src/main.js" || fail "Core Help articles not registered"
grep -q "app.provide('tecTacHelp'" "${ROOT}/src/main.js" || fail "Help runtime not provided by shell"
grep -q "help: moduleHelp" "${ROOT}/src/module-loader.js" || fail "module-scoped Help runtime not passed to modules"
grep -q "moduleHelp?.clear" "${ROOT}/src/module-loader.js" || fail "failed module registration does not clean Help articles"
grep -q "path: '/help'" "${ROOT}/src/router.js" || fail "Knowledge Base route missing"
grep -q "path: '/help/:articleId'" "${ROOT}/src/router.js" || fail "Knowledge Base deep-link route missing"
grep -q "class=\"iconbtn help-topbar-button\"" "${ROOT}/src/App.vue" || fail "top-bar Help button missing"
grep -q "<HelpDrawer" "${ROOT}/src/App.vue" || fail "Help drawer not mounted by shell"
grep -q 'help_dir=extension/"help"' "${ROOT}/scripts/sync-modules.sh" || fail "module help directory is not deployed by synchronizer"
grep -q "Help article contributions" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts Help contribution section missing"
grep -q "help.open(articleId)" "${ROOT}/docs/module-help.md" || fail "module Help open contract missing"
grep -q "Do not create module-specific help drawers" "${ROOT}/docs/ui-design-standards.md" || fail "Core-owned Help design rule missing"
ARTICLE_COUNT=$(find "${ROOT}/src/help/articles" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')
[[ "${ARTICLE_COUNT}" -ge 10 ]] || fail "expected at least ten Core Help articles, found ${ARTICLE_COUNT}"
node --check "${ROOT}/src/help.js"
node --check "${ROOT}/src/help/markdown.js"
node --check "${ROOT}/src/help/core-articles.js"
echo "[TEST] PASS Core Help and Knowledge Base contract"


# 0.12.5 RBAC permission editor workflow
grep -q "const extensionModules = computed" "${ROOT}/src/components/access/RolesPanel.vue" || fail "extension permissions are not grouped by module"
grep -q "extensionPermissionLabel" "${ROOT}/src/components/access/RolesPanel.vue" || fail "compact extension permission labels missing"
grep -q "Expand all" "${ROOT}/src/components/access/RolesPanel.vue" || fail "RBAC Expand all control missing"
grep -q "Collapse all" "${ROOT}/src/components/access/RolesPanel.vue" || fail "RBAC Collapse all control missing"
grep -q "class=\"permission-columns\"" "${ROOT}/src/components/access/RolesPanel.vue" || fail "independent permission columns missing"
grep -q "permission-column" "${ROOT}/src/styles.css" || fail "independent permission column styling missing"
grep -q "permission-copy-inline" "${ROOT}/src/styles.css" || fail "compact extension permission row styling missing"
grep -q 'role-action-state span{color:var(--dim);font-size:calc(12.1px' "${ROOT}/src/styles.css" || fail "role action-bar text size was not increased"
echo "[TEST] PASS RBAC permission editor workflow"

# 0.12.6 solid Core notification toast surface
TOAST_CSS="${ROOT}/src/styles.css"
grep -Fq '.toast-card{pointer-events:auto;display:grid;grid-template-columns:30px minmax(0,1fr) 28px;gap:10px;align-items:start;padding:12px;border:1px solid var(--line);border-left-width:4px;border-radius:10px;background:var(--surface);' "${TOAST_CSS}" || fail "toast card does not use the opaque Core surface token"
grep -Fq '.toast-info{border-left-color:var(--accent)}' "${TOAST_CSS}" || fail "info toast semantic edge missing"
grep -Fq '.toast-success{border-left-color:var(--ok)}' "${TOAST_CSS}" || fail "success toast semantic edge missing"
grep -Fq '.toast-warning{border-left-color:var(--warn)}' "${TOAST_CSS}" || fail "warning toast semantic edge missing"
grep -Fq '.toast-error{border-left-color:var(--danger)}' "${TOAST_CSS}" || fail "error toast semantic edge missing"
if grep -Fq 'var(--panel)' "${TOAST_CSS}"; then fail "undefined --panel token remains in Core toast styling"; fi
for token in surface line accent ok warn danger; do
  grep -Eq -- "--${token}:" "${TOAST_CSS}" || fail "theme token --${token} is not defined"
done
echo "[TEST] PASS solid Core notification toast surface"

# 0.12.7 Core-owned audit write runtime
[[ -f "${ROOT}/src/audit.js" ]] || fail "Core audit browser runtime missing"
[[ -f "${ROOT}/docs/module-audit.md" ]] || fail "module audit developer documentation missing"
grep -q "createAuditService" "${ROOT}/src/main.js" || fail "Core audit service not created by shell"
grep -q "app.provide('tecTacAudit'" "${ROOT}/src/main.js" || fail "Core audit service not provided by shell"
grep -q "^[[:space:]]*audit,$" "${ROOT}/src/main.js" || fail "Core audit service not passed to authenticated module loader"
grep -q "audit: moduleAudit" "${ROOT}/src/module-loader.js" || fail "module-scoped audit runtime not passed to modules"
grep -q "/api/tfd/audit/record/" "${ROOT}/src/audit.js" || fail "Core audit endpoint integration missing"
grep -q "FORBIDDEN_EVENT_FIELDS" "${ROOT}/src/audit.js" || fail "browser actor/provenance spoof guard missing"
grep -q "audit_service_unavailable" "${ROOT}/src/audit.js" || fail "non-fatal audit failure behavior missing"
grep -q "Core audit write contract" "${ROOT}/src/views/ContractsView.vue" || fail "Public Contracts audit section missing"
node --check "${ROOT}/src/audit.js"
echo "[TEST] PASS Core-owned audit write runtime"

# 0.12.8 Core Troubleshooting & Diagnostics
[[ -f "${ROOT}/src/views/DiagnosticsView.vue" ]] || fail "diagnostics view missing"
grep -q "'/system/diagnostics'" "${ROOT}/src/router.js" || fail "diagnostics route missing"
grep -q "Troubleshooting & Diagnostics" "${ROOT}/src/core-navigation.js" || fail "diagnostics navigation missing"
grep -q "getSystemDiagnostics" "${ROOT}/src/api.js" || fail "diagnostics API helper missing"
grep -q "live_capabilities=1" "${ROOT}/src/api.js" || fail "live capability diagnostics switch missing"
grep -q "core.troubleshooting-diagnostics" "${ROOT}/src/help/core-articles.js" || fail "diagnostics help registration missing"
grep -q "core.troubleshooting-migrations" "${ROOT}/src/help/core-articles.js" || fail "migration troubleshooting help registration missing"
grep -q "diagnostic-section-head" "${ROOT}/src/styles.css" || fail "diagnostics shared styling missing"
printf '[TEST] PASS diagnostics UI foundation\n'

# 0.12.9 same-version module reinstall confirmation
grep -q "function sameOnlineVersion" "${ROOT}/src/views/ModulesView.vue" || fail "same-version module detection missing"
grep -q "function requestStageOnline" "${ROOT}/src/views/ModulesView.vue" || fail "same-version staging guard missing"
grep -q 'v-if="reinstallTarget"' "${ROOT}/src/views/ModulesView.vue" || fail "module reinstall confirmation dialog missing"
grep -q 'SAME VERSION' "${ROOT}/src/views/ModulesView.vue" || fail "same-version reinstall warning missing"
grep -q 'Continue to reinstall' "${ROOT}/src/views/ModulesView.vue" || fail "module reinstall confirmation action missing"
grep -q '@click="requestStageOnline(item)"' "${ROOT}/src/views/ModulesView.vue" || fail "online catalog does not use reinstall confirmation guard"
grep -q "item.update_available ? 'Download update' : 'Reinstall'" "${ROOT}/src/views/ModulesView.vue" || fail "up-to-date module action is not labelled Reinstall"
printf '[TEST] PASS same-version module reinstall confirmation\n'

# 0.12.10 module package signature intake and trust visibility
grep -q "body.append('signature',signature)" "${ROOT}/src/modules.js" || fail "module signature sidecar is not sent to Core"
grep -q "body.append('metadata',metadata)" "${ROOT}/src/modules.js" || fail "module release metadata sidecar is not sent to Core"
grep -q "function intakeFileType" "${ROOT}/src/views/ModulesView.vue" || fail "module package sidecar classifier missing"
grep -q "stagedTrust = computed" "${ROOT}/src/views/ModulesView.vue" || fail "staged package trust result missing"
grep -q 'data-label="Trust"' "${ROOT}/src/views/ModulesView.vue" || fail "package trust review column missing"
grep -q "Signing is optional for normal modules at this stage" "${ROOT}/src/views/ModulesView.vue" || fail "unsigned transitional policy is not explicit in trust popover"
grep -q "Privileged publisher permissions still require a trusted signature" "${ROOT}/src/views/ModulesView.vue" || fail "privileged unsigned-package boundary is not visible"
grep -q "publisher_display_name" "${ROOT}/src/views/ModulesView.vue" || fail "publisher identity is not shown after verification"
grep -q "key_id" "${ROOT}/src/views/ModulesView.vue" || fail "publisher key identity is not shown after verification"
node --check "${ROOT}/src/modules.js"
printf '[TEST] PASS module package signature intake and trust visibility\n'

# 0.12.11 compact package trust badge and hover/focus details
grep -q 'module-trust-badge' "${ROOT}/src/views/ModulesView.vue" || fail "compact package trust badge missing"
grep -q 'module-trust-popover' "${ROOT}/src/views/ModulesView.vue" || fail "package trust hover/focus details missing"
grep -q "stagedTrustLabel === 'VERIFIED' ? 'SIGNED'" "${ROOT}/src/views/ModulesView.vue" || fail "verified package is not labelled SIGNED in review row"
! grep -q 'class="card mt module-signature-card"' "${ROOT}/src/views/ModulesView.vue" || fail "large package trust card still present"
grep -q '.module-trust-badge:hover .module-trust-popover' "${ROOT}/src/styles.css" || fail "trust hover popover styling missing"
grep -q '.module-trust-badge:focus .module-trust-popover' "${ROOT}/src/styles.css" || fail "keyboard trust popover styling missing"
printf '[TEST] PASS compact package trust badge and details popover\n'
