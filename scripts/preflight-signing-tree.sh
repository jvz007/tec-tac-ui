#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { printf '[TEC-TAC-UI] SIGNING PREFLIGHT FAILED: %s\n' "$*" >&2; exit 1; }

# Signed source releases must contain source only. Generated dependency/build
# trees are deliberately excluded because they contain symlinks/executables and
# are recreated by the signed installer after Core verifies the source tree.
for rel in node_modules dist .vite; do
  if [[ -e "${ROOT}/${rel}" || -L "${ROOT}/${rel}" ]]; then
    fail "generated path '${rel}' is present. Remove it and sign a clean source tree."
  fi
done

# Core's signed-tree verifier accepts regular files/directories only. Match that
# rule here so a publisher discovers invalid release content before signing.
BAD="$(find "${ROOT}" \
  -path "${ROOT}/.git" -prune -o \
  \( -type l -o -type b -o -type c -o -type p -o -type s \) \
  -print -quit)"
if [[ -n "${BAD}" ]]; then
  rel="${BAD#${ROOT}/}"
  fail "link or special file '${rel}' is present. Signed source releases permit regular files/directories only."
fi

printf '[TEC-TAC-UI] Signing tree preflight OK: %s\n' "${ROOT}"
