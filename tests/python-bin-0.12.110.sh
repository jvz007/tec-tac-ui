#!/usr/bin/env bash
# 0.12.110: the shell tests find a Python that really runs. The Windows Store alias for python3 exits with an error and is skipped.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }

HELPER="${ROOT}/tests/python-bin.sh"
[[ -f "${HELPER}" ]] || fail "tests/python-bin.sh is missing"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

# make_bin <dir> <name> <exit code> <text>: an executable that prints its text and exits with the code.
make_bin(){
  mkdir -p "$1"
  printf '#!/usr/bin/env bash\necho "%s"\nexit %s\n' "$4" "$3" > "$1/$2"
  chmod +x "$1/$2"
}

# run_helper <dir to put first on PATH> <PYTHON_BIN or empty>: sources the helper, then runs the interpreter it chose.
run_helper(){
  PATH="$1:${PATH}" PYTHON_BIN="$2" bash -c 'source "$1" && "$PY" -c x' _ "${HELPER}"
}

# (1) python3 is the Windows alias (exits 1); python works. The helper picks python.
DIR1="${TMP}/one"
make_bin "${DIR1}" python3 1 "ALIAS-FAILS"
make_bin "${DIR1}" python 0 "PYTHON-WORKS"
out="$(run_helper "${DIR1}" "")"
[[ "${out}" == "PYTHON-WORKS" ]] || fail "expected the working python, got '${out}'"

# (2) python exits with an error and python3 works. The helper skips python and picks python3.
DIR2="${TMP}/two"
make_bin "${DIR2}" python 1 "BROKEN-PYTHON"
make_bin "${DIR2}" python3 0 "PYTHON3-WORKS"
out="$(run_helper "${DIR2}" "")"
[[ "${out}" == "PYTHON3-WORKS" ]] || fail "expected python3 after python failed, got '${out}'"

# (3) PYTHON_BIN, when it runs, comes before every other candidate.
DIR3="${TMP}/three"
make_bin "${DIR3}" python 0 "PYTHON-WORKS"
make_bin "${TMP}/chosen" custom-python 0 "CHOSEN-WORKS"
out="$(run_helper "${DIR3}" "${TMP}/chosen/custom-python")"
[[ "${out}" == "CHOSEN-WORKS" ]] || fail "expected PYTHON_BIN first, got '${out}'"

# (4) no interpreter runs: one plain line that names what was tried, and a failure exit.
DIR4="${TMP}/four"
make_bin "${DIR4}" python 1 "x"
make_bin "${DIR4}" python3 1 "x"
make_bin "${DIR4}" py 1 "x"
err_file="${TMP}/err.txt"
if PATH="${DIR4}:${PATH}" PYTHON_BIN="" bash -c 'source "$1" && "$PY" -c x' _ "${HELPER}" >/dev/null 2>"${err_file}"; then
  fail "the helper must fail when no interpreter runs"
fi
[[ "$(wc -l < "${err_file}")" -eq 1 ]] || fail "the failure is one line, got: $(cat "${err_file}")"
grep -Fq "no Python interpreter ran (tried: python, python3, py -3)" "${err_file}" || fail "the failure names what it tried: $(cat "${err_file}")"

# (5) the scripts that used python3 now call the helper, and none still calls a bare python3.
for script in tests/foundation.sh tests/release-integrity.sh tests/release-workflow-lockfile.sh; do
  if grep -Eq '(^|[^A-Za-z0-9_./-])python3 ' "${ROOT}/${script}"; then
    fail "${script} still calls python3 directly"
  fi
  grep -Fq 'source "${ROOT}/tests/python-bin.sh"' "${ROOT}/${script}" || grep -Fq 'source "$ROOT/tests/python-bin.sh"' "${ROOT}/${script}" \
    || fail "${script} does not source the helper"
  grep -Fq '"${PY}"' "${ROOT}/${script}" || fail "${script} does not use \"\${PY}\""
done

# (6) the helper hard-codes no project path (no .venv), so it works on any PC and on the Linux server.
if grep -Fq '.venv' "${HELPER}"; then fail "the helper must not hard-code the .venv path"; fi

echo "[TEST] PASS python interpreter selection 0.12.110"
