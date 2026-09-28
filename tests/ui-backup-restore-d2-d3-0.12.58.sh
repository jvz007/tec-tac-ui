#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/tests/ui-backup-restore-d2-d3-0.12.58.mjs"
