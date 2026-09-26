#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -f package-lock.json ]] || { echo '[TEST] FAIL package-lock.json is missing' >&2; exit 1; }
python3 - <<'PY'
import json
from pathlib import Path
pkg=json.loads(Path('package.json').read_text())
lock=json.loads(Path('package-lock.json').read_text())
root=lock.get('packages',{}).get('',{})
assert lock.get('lockfileVersion') == 3, lock.get('lockfileVersion')
assert lock.get('name') == pkg.get('name')
assert lock.get('version') == pkg.get('version')
assert root.get('name') == pkg.get('name')
assert root.get('version') == pkg.get('version')
assert root.get('dependencies') == pkg.get('dependencies')
assert root.get('devDependencies') == pkg.get('devDependencies')
for name, version in {**pkg.get('dependencies',{}), **pkg.get('devDependencies',{})}.items():
    entry=lock.get('packages',{}).get(f'node_modules/{name}')
    assert entry, f'missing lock entry for {name}'
    assert entry.get('version') == version, (name, entry.get('version'), version)
    assert entry.get('integrity'), f'missing integrity for {name}'
    assert entry.get('resolved'), f'missing resolved URL for {name}'
PY

WF=.github/workflows/release.yml
grep -Fq 'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4' "$WF"
grep -Fq 'uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4' "$WF"
grep -Fq 'run: npm ci' "$WF"
if grep -Eq 'uses: actions/(checkout|setup-node)@v[0-9]+' "$WF"; then
  echo '[TEST] FAIL release workflow contains a floating GitHub Action tag' >&2
  exit 1
fi
if grep -Fq 'npm install --no-package-lock' "$WF"; then
  echo '[TEST] FAIL release workflow bypasses package-lock.json' >&2
  exit 1
fi

echo '[TEST] PASS reproducible UI release workflow'
