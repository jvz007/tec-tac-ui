#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }
[[ "$(tr -d '\r\n' < "${ROOT}/VERSION")" == "0.1.0" ]] || fail "VERSION is not 0.1.0"
[[ -f "${ROOT}/src/module-loader.js" ]] || fail "module loader missing"
[[ -f "${ROOT}/scripts/install.sh" ]] || fail "installer missing"
[[ -f "${ROOT}/scripts/sync-modules.sh" ]] || fail "module sync missing"
[[ -f "${ROOT}/examples/reference-module/tec_tac_ui.json" ]] || fail "reference manifest missing"
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
echo "[TEST] PASS foundation"
