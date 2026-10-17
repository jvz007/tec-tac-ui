#!/usr/bin/env bash
# 0.12.116: the FilterEditor and docs-reword tests, run together. They are one entry in the test script because the script line is close
# to the 8191 character command line limit on Windows (npm runs it through cmd). Each test prints its own PASS line.
set -euo pipefail
cd "$(dirname "$0")/.."
for t in filter-editor-0.12.116 filter-editor-component-0.12.116 filter-editor-sets-0.12.116 filter-editor-binding-0.12.116 filter-editor-docs-0.12.116 contract-docs-reword-0.12.116; do
  node "tests/$t.mjs"
done
