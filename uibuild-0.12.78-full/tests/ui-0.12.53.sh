#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node tests/ui-0.12.53.mjs
