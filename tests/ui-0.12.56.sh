#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
node tests/release-notes-l74.mjs
echo "[TEST] PASS UI 0.12.56 tracker closure L74"
