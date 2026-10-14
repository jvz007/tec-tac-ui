#!/usr/bin/env bash
# Sourced by the shell tests (0.12.110). Sets PY to a Python interpreter that really runs.
# The Windows Store alias for python3 exits with an error, so every candidate gets a real run first.
# Order: $PYTHON_BIN, python, python3, py -3 (the order tests/popup-mode-0.12.95.mjs uses, with -3 for the launcher).
# PY names a shell function that runs the chosen interpreter, so "${PY}" also works for "py -3".
_tec_tac_python_cmd=()
_tec_tac_python_tried=()
for _tec_tac_candidate in "${PYTHON_BIN:-}" python python3 "py -3"; do
  [[ -n "${_tec_tac_candidate}" ]] || continue
  read -r -a _tec_tac_words <<< "${_tec_tac_candidate}"
  _tec_tac_python_tried+=("${_tec_tac_candidate}")
  if "${_tec_tac_words[@]}" -c 'import sys' >/dev/null 2>&1; then
    _tec_tac_python_cmd=("${_tec_tac_words[@]}")
    break
  fi
done
if [[ ${#_tec_tac_python_cmd[@]} -eq 0 ]]; then
  printf -v _tec_tac_python_list '%s, ' "${_tec_tac_python_tried[@]}"
  echo "[TEST] FAIL: no Python interpreter ran (tried: ${_tec_tac_python_list%, })" >&2
  exit 1
fi
tec_tac_python() { "${_tec_tac_python_cmd[@]}" "$@"; }
PY=tec_tac_python
