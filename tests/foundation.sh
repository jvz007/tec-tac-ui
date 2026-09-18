#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }
[[ "$(tr -d '\r\n' < "${ROOT}/VERSION")" == "0.1.1" ]] || fail "VERSION is not 0.1.1"
[[ -f "${ROOT}/src/module-loader.js" ]] || fail "module loader missing"
[[ -f "${ROOT}/scripts/install.sh" ]] || fail "installer missing"
[[ -f "${ROOT}/scripts/sync-modules.sh" ]] || fail "module sync missing"
[[ -f "${ROOT}/examples/reference-module/tec_tac_ui.json" ]] || fail "reference manifest missing"
grep -q "validateTacticalSession" "${ROOT}/src/api.js" || fail "Tactical session verifier missing"
grep -q "authStatus: 'verifying'" "${ROOT}/src/state.js" || fail "auth verification state missing"
grep -q "state.authStatus !== 'verified'" "${ROOT}/src/App.vue" || fail "operational shell is not auth gated"
grep -q '"version": "0.1.1"' "${ROOT}/package.json" || fail "package.json version is not 0.1.1"
python3 - "${ROOT}/examples/reference-module/tec_tac_ui.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
assert p['id']=='reference'
assert p['entry']=='ui/index.js'
assert isinstance(p.get('permissions'),list)
print('[TEST] reference manifest OK')
PY
bash -n "${ROOT}/scripts/install.sh"
bash -n "${ROOT}/scripts/uninstall.sh"
bash -n "${ROOT}/scripts/sync-modules.sh"
node --check "${ROOT}/src/main.js"
node --check "${ROOT}/src/api.js"
node --check "${ROOT}/src/state.js"
echo "[TEST] PASS foundation"
