#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }
VERSION="$(tr -d '\r\n' < "${ROOT}/VERSION")"
python3 - "${ROOT}/package.json" "${ROOT}/tec_tac_package.json" "${VERSION}" <<'PY'
import json,sys
pkg=json.load(open(sys.argv[1],encoding='utf-8'))
manifest=json.load(open(sys.argv[2],encoding='utf-8'))
version=sys.argv[3]
assert pkg['version']==version, (pkg['version'],version)
assert manifest['version']==version, (manifest['version'],version)
PY
[[ -f "${ROOT}/RELEASE_NOTES_${VERSION}.md" ]] || fail "current release note missing"
mapfile -t ROOT_NOTES < <(find "${ROOT}" -maxdepth 1 -type f -name 'RELEASE_NOTES_*.md' -printf '%f\n' | sort)
[[ ${#ROOT_NOTES[@]} -eq 1 ]] || fail "expected exactly one root release note, found ${#ROOT_NOTES[@]}"
[[ "${ROOT_NOTES[0]}" == "RELEASE_NOTES_${VERSION}.md" ]] || fail "root release note does not match current version"
echo "[TEST] PASS release integrity ${VERSION}"
