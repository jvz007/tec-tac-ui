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

python3 - "${ROOT}" "${VERSION}" <<'PY_ARCHIVE'
from pathlib import Path
import re,sys
root=Path(sys.argv[1]); version=sys.argv[2]
m=re.fullmatch(r"0\.12\.(\d+)(?:-(\d+))?", version)
assert m, version
current=int(m.group(1)); rebuild=m.group(2) is not None
archive=root/'docs'/'releases'
stop=current + (1 if rebuild else 0)
for patch in range(32,stop):
    archived=f"0.12.{patch}"
    note=archive/f"RELEASE_NOTES_{archived}.md"
    assert note.is_file(), f"missing archived release note {archived}"
    first=note.read_text(encoding='utf-8').splitlines()[:1]
    assert first and re.fullmatch(rf"# (?:Tec-Tac )?UI {re.escape(archived)}", first[0]), (archived,first)
for note in archive.glob('RELEASE_NOTES_*.md'):
    assert not re.fullmatch(r"RELEASE_NOTES_\d+\.\d+\.\d+-\d+\.md", note.name), note.name
PY_ARCHIVE

[[ -f "${ROOT}/scripts/preflight-signing-tree.sh" ]] || \
  fail "signing-tree preflight script is missing"

echo "[TEST] PASS release integrity ${VERSION}"
