#!/usr/bin/env bash
# 0.12.112 (Core 1.17.43 request): scripts/install.sh exits 78 and prints '[TEC-TAC-INSTALL] REFUSED: <reason>' on stderr when it
# refuses before the first change to the live deployment (missing env-config.js, missing npm, failed staged sync-modules.sh
# preflight). Every other failure keeps exit 1. No 78 may come after the first live change. Runs a copy of install.sh with only
# the root test swapped, in a temp tree. The text of SystemUpdatesView is checked by a node assertion.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
fail() { echo "installer-refusal-0.12.112: FAIL: $*" >&2; exit 1; }

# the static rules, on the real file
grep -q '^refuse()' "${HERE}/scripts/install.sh" || fail "refuse() is missing"
live_line="$(grep -n 'mkdir -p "${DEPLOY_BASE}"' "${HERE}/scripts/install.sh" | head -1 | cut -d: -f1)"
[ -n "${live_line}" ] || fail "cannot find the first live change"
late="$(awk -v n="${live_line}" 'NR>n && /refuse /' "${HERE}/scripts/install.sh")"
[ -z "${late}" ] || fail "refuse is called after the first live change: ${late}"
[ "$(grep -c 'exit 78' "${HERE}/scripts/install.sh")" = "1" ] || fail "exit 78 must be written once, inside refuse()"

# a temp tree with a copy of install.sh whose root test is swapped for a no-op
TREE="${WORK}/tree"
mkdir -p "${TREE}/scripts" "${WORK}/stubs"
sed 's/^\[\[ \${EUID} -eq 0 \]\] || fail "Run as root."$/true/' "${HERE}/scripts/install.sh" > "${TREE}/scripts/install.sh"
grep -q '^true$' "${TREE}/scripts/install.sh" || fail "the root test was not swapped"
cp "${HERE}/scripts/tec-tac-config.sh" "${TREE}/scripts/tec-tac-config.sh"
echo "0.0.0" > "${TREE}/VERSION"
echo '{}' > "${TREE}/package.json"
CONF="${WORK}/tec-tac-config.conf"
: > "${CONF}"
FRONTEND_OK="${WORK}/frontend-ok"; mkdir -p "${FRONTEND_OK}"; : > "${FRONTEND_OK}/env-config.js"
FRONTEND_NONE="${WORK}/frontend-none"; mkdir -p "${FRONTEND_NONE}"
DEPLOY="${WORK}/deploy/tec-tac"

# a stub npm: 'ci' ok, 'run build' makes dist/index.html; NPM_FAIL=ci makes it fail
cat > "${WORK}/stubs/npm" <<'STUB'
#!/usr/bin/env bash
if [ "${NPM_FAIL:-}" = "ci" ] && [ "$1" = "ci" ]; then exit 4; fi
if [ "$1" = "run" ] && [ "$2" = "build" ]; then mkdir -p dist && echo ok > dist/index.html; fi
exit 0
STUB
chmod +x "${WORK}/stubs/npm"

# the caller's PATH without any directory that holds an npm, so only the stub npm can be found
BASE_PATH=""
IFS=':' read -r -a dirs <<< "${PATH}"
for d in "${dirs[@]}"; do
  [ -n "${d}" ] || continue
  if [ -e "${d}/npm" ] || [ -e "${d}/npm.cmd" ] || [ -e "${d}/npm.exe" ]; then continue; fi
  BASE_PATH="${BASE_PATH:+${BASE_PATH}:}${d}"
done

run() { # run <frontend> <path> [extra env...]
  local frontend="$1" path="$2"; shift 2
  env HOME="${WORK}" PATH="${path}" TEC_TAC_CONFIG_FILE="${CONF}" TEC_TAC_UI_DEPLOY_ROOT="${DEPLOY}" TACTICAL_FRONTEND_ROOT="${frontend}" "$@" \
    bash "${TREE}/scripts/install.sh" > "${WORK}/out" 2> "${WORK}/err"
  return $?
}
expect() { # expect <status> <marker yes|no> <label>
  local got=$?
  [ "${got}" = "$1" ] || fail "$3: expected exit $1, got ${got}: $(cat "${WORK}/err")"
  if [ "$2" = yes ]; then
    grep -q '^\[TEC-TAC-INSTALL\] REFUSED: ' "${WORK}/err" || fail "$3: no REFUSED line on stderr"
    grep -q '^\[TEC-TAC-UI\] ERROR: ' "${WORK}/err" || fail "$3: no ERROR line on stderr"
  else
    ! grep -q 'REFUSED' "${WORK}/err" || fail "$3: a REFUSED line on a non-refusal"
  fi
}

# (1) env-config.js missing: 78
run "${FRONTEND_NONE}" "${WORK}/stubs:${BASE_PATH}"; expect 78 yes "missing env-config.js"
[ ! -e "${WORK}/deploy" ] || fail "a refusal created the deploy base"

# (2) npm missing: 78
run "${FRONTEND_OK}" "${BASE_PATH}"; expect 78 yes "missing npm"

# (3) a failing staged sync-modules.sh: 78, and the live deployment is untouched
printf '#!/usr/bin/env bash\nexit 3\n' > "${TREE}/scripts/sync-modules.sh"
run "${FRONTEND_OK}" "${WORK}/stubs:${BASE_PATH}"; expect 78 yes "failed staged preflight"
[ ! -e "${WORK}/deploy" ] || fail "a refused preflight created the deploy base"

# (4) npm ci failing: 1, no marker
run "${FRONTEND_OK}" "${WORK}/stubs:${BASE_PATH}" NPM_FAIL=ci; expect 1 no "npm ci failure"

# (5) not root: 1 (run the unswapped script when not root)
if [ "$(id -u)" != "0" ]; then
  env HOME="${WORK}" PATH="${WORK}/stubs:${BASE_PATH}" TEC_TAC_CONFIG_FILE="${CONF}" TACTICAL_FRONTEND_ROOT="${FRONTEND_OK}" \
    bash "${HERE}/scripts/install.sh" > "${WORK}/out" 2> "${WORK}/err"
  expect 1 no "not root"
fi

echo "installer-refusal-0.12.112: PASS"
