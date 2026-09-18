#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

[[ "$(tr -d '\r\n' < "${ROOT}/VERSION")" == "0.1.2" ]] || fail "VERSION is not 0.1.2"
[[ -f "${ROOT}/src/module-loader.js" ]] || fail "module loader missing"
[[ -f "${ROOT}/src/components/LoginPanel.vue" ]] || fail "login panel missing"
[[ -f "${ROOT}/scripts/install.sh" ]] || fail "installer missing"
[[ -f "${ROOT}/scripts/sync-modules.sh" ]] || fail "module sync missing"
[[ -f "${ROOT}/examples/reference-module/tec_tac_ui.json" ]] || fail "reference manifest missing"

grep -q "'/v2/checkcreds/'" "${ROOT}/src/api.js" || fail "Tactical credential-check endpoint missing"
grep -q "'/v2/login/'" "${ROOT}/src/api.js" || fail "Tactical TOTP login endpoint missing"
grep -q "requiresTotpSetup" "${ROOT}/src/api.js" || fail "TOTP enrollment guard missing"
grep -q "LoginPanel" "${ROOT}/src/App.vue" || fail "login panel is not wired into shell"
grep -q "autocomplete=\"current-password\"" "${ROOT}/src/components/LoginPanel.vue" || fail "password field semantics missing"
grep -q "autocomplete=\"one-time-code\"" "${ROOT}/src/components/LoginPanel.vue" || fail "TOTP field semantics missing"

python3 - "${ROOT}/package.json" "${ROOT}/examples/reference-module/tec_tac_ui.json" <<'PY'
import json,sys
package=json.load(open(sys.argv[1],encoding='utf-8'))
assert package['version']=='0.1.2'
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
