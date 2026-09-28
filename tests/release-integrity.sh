#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }
VERSION="$(tr -d '\r\n' < "${ROOT}/VERSION")"
python3 - "${ROOT}/package.json" "${ROOT}/tec_tac_package.json" "${VERSION}" <<'PY_VERSION'
import json,sys
pkg=json.load(open(sys.argv[1],encoding='utf-8'))
manifest=json.load(open(sys.argv[2],encoding='utf-8'))
version=sys.argv[3]
assert pkg['version']==version, (pkg['version'],version)
assert manifest['version']==version, (manifest['version'],version)
PY_VERSION

mapfile -t ROOT_NOTES < <(
  find "${ROOT}" -maxdepth 1 -type f \
    -name 'RELEASE_NOTES_*.md' \
    -printf '%f\n' | sort
)

[[ ${#ROOT_NOTES[@]} -eq 1 ]] || \
  fail "expected exactly one root release note, found ${#ROOT_NOTES[@]}"

CURRENT_NOTE="RELEASE_NOTES_${VERSION}.md"
printf '%s\n' "${ROOT_NOTES[@]}" | grep -Fxq "${CURRENT_NOTE}" || \
  fail "current release note ${CURRENT_NOTE} not found"

for archived in 0.12.32 0.12.33 0.12.34 0.12.35; do
  note="${ROOT}/docs/releases/RELEASE_NOTES_${archived}.md"
  [[ -f "${note}" ]] || fail "missing recovered archived release note ${archived}"
  head -n 1 "${note}" | grep -Fxq "# Tec-Tac UI ${archived}" || \
    fail "archived release note heading mismatch for ${archived}"
done
[[ ! -e "${ROOT}/docs/releases/RELEASE_NOTES_0.12.34-1.md" ]] || \
  fail "rebuild-suffixed 0.12.34-1 must not be a separate archive identity"

[[ -f "${ROOT}/scripts/preflight-signing-tree.sh" ]] || \
  fail "signing-tree preflight script is missing"

echo "[TEST] PASS release integrity ${VERSION}"
