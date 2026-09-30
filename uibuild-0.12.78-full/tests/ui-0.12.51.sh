#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/tests/ui-0.12.51.mjs"
echo "ui 0.12.51 shell: PASS"
