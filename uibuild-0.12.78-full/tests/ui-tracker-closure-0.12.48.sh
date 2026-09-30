#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "${ROOT}/tests/ui-tracker-closure-0.12.48.mjs"
