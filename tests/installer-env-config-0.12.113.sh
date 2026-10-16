#!/usr/bin/env bash
# 0.12.113 (installer agent, via Johan): scripts/install.sh writes ${TARGET_ROOT}/env-config.js (window._env_.PROD_URL) from
# TEC_TAC_API_URL. Sources in order: the caller's environment, tec-tac.conf, the previously deployed file. No URL, or a bad one, is a
# refusal (78) before any live change. The file is written into the STAGED tree, then verified after the live copy (exit 1 on failure).
# Runs a copy of install.sh with only the root test swapped, in a temp tree, with stub npm, sync-modules.sh, repair-nginx.sh and chown.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
fail() { echo "installer-env-config-0.12.113: FAIL: $*" >&2; exit 1; }
INSTALL="${HERE}/scripts/install.sh"

# (9) static rules on the real file
live_line="$(grep -n 'mkdir -p "${DEPLOY_BASE}"' "${INSTALL}" | head -1 | cut -d: -f1)"
[ -n "${live_line}" ] || fail "cannot find the first live change"
[ -z "$(awk -v n="${live_line}" 'NR>n && /refuse /' "${INSTALL}")" ] || fail "refuse is called after the first live change"
[ "$(grep -c 'exit 78' "${INSTALL}")" = "1" ] || fail "exit 78 must be written once, inside refuse()"
! grep -qiE 'southernhorizon|techxflow' "${INSTALL}" || fail "a customer hostname is written in install.sh"
grep -q 'chmod 0644' "${INSTALL}" || fail "env-config.js is not set to 0644"
grep -q 'mv -f' "${INSTALL}" || fail "env-config.js is not moved into place"
! grep -q '<<EOF' "${INSTALL}" || fail "a heredoc writes the file"
! grep -q 'Tactical frontend env-config.js not found' "${INSTALL}" || fail "the old Tactical env-config.js refusal is still there"

TREE="${WORK}/tree"
mkdir -p "${TREE}/scripts" "${WORK}/stubs"
sed 's/^\[\[ \${EUID} -eq 0 \]\] || fail "Run as root."$/true/' "${INSTALL}" > "${TREE}/scripts/install.sh"
grep -q '^true$' "${TREE}/scripts/install.sh" || fail "the root test was not swapped"
cp "${HERE}/scripts/tec-tac-config.sh" "${TREE}/scripts/tec-tac-config.sh"
echo "0.0.0" > "${TREE}/VERSION"
echo '{}' > "${TREE}/package.json"
CONF="${WORK}/tec-tac-config.conf"
DEPLOY="${WORK}/deploy/tec-tac"
FRONTEND="${WORK}/frontend"

cat > "${WORK}/stubs/npm" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "run" ] && [ "$2" = "build" ]; then mkdir -p dist && echo '<html>ok</html>' > dist/index.html; fi
exit 0
STUB
cat > "${WORK}/stubs/chown" <<'STUB'
#!/usr/bin/env bash
if [ -n "${CHOWN_CLOBBER:-}" ]; then
  f="$(find "${CHOWN_CLOBBER}" -name env-config.js | head -1)"
  [ -n "${f}" ] && echo '<!doctype html><html></html>' > "${f}"
fi
exit 0
STUB
chmod +x "${WORK}/stubs/npm" "${WORK}/stubs/chown"
# stub sync-modules.sh: the staged tree must already hold env-config.js
cat > "${TREE}/scripts/sync-modules.sh" <<'STUB'
#!/usr/bin/env bash
[ -n "${NO_ENV_OK:-}" ] || [ -f "${TEC_TAC_UI_ROOT}/env-config.js" ] || { echo "staged env-config.js missing" >&2; exit 3; }
cp "${TEC_TAC_UI_ROOT}/env-config.js" "${STAGED_COPY:-/dev/null}" 2>/dev/null
exit 0
STUB
printf '#!/usr/bin/env bash\necho called >> "${REPAIR_MARK:-/dev/null}"\nexit 0\n' > "${TREE}/scripts/repair-nginx.sh"

BASE_PATH=""
IFS=':' read -r -a dirs <<< "${PATH}"
for d in "${dirs[@]}"; do
  [ -n "${d}" ] || continue
  if [ -e "${d}/npm" ] || [ -e "${d}/npm.cmd" ] || [ -e "${d}/npm.exe" ]; then continue; fi
  BASE_PATH="${BASE_PATH:+${BASE_PATH}:}${d}"
done

# 0.12.115: a host with a Tactical frontend root and no nginx block is refused, so the default run has a frontend.conf; case (10) overrides it.
echo 'server { }' > "${WORK}/default-frontend.conf"
run() { # run [env...]; uses the global CONF
  env -u TEC_TAC_API_URL HOME="${WORK}" PATH="${WORK}/stubs:${BASE_PATH}" TEC_TAC_CONFIG_FILE="${CONF}" TEC_TAC_UI_DEPLOY_ROOT="${DEPLOY}" \
    TACTICAL_FRONTEND_ROOT="${FRONTEND}" TACTICAL_FRONTEND_NGINX_CONF="${WORK}/default-frontend.conf" "$@" \
    bash "${TREE}/scripts/install.sh" > "${WORK}/out" 2> "${WORK}/err"
  return $?
}
reset() { rm -rf "${WORK}/deploy" "${FRONTEND}"; : > "${CONF}"; }
expect_refused() { # expect_refused <status-from-run> <label>
  [ "$1" = "78" ] || fail "$2: expected exit 78, got $1: $(cat "${WORK}/err")"
  grep -q '^\[TEC-TAC-INSTALL\] REFUSED: ' "${WORK}/err" || fail "$2: no REFUSED line"
  [ ! -e "${WORK}/deploy/tec-tac/index.html" ] || fail "$2: a refusal deployed the UI"
}
expected_file() { printf 'window._env_ = {\n  PROD_URL: "%s"\n};\n' "$1"; }
check_file() { # check_file <url> <label>
  local f="${DEPLOY}/env-config.js"
  [ -f "${f}" ] && [ ! -L "${f}" ] || fail "$2: env-config.js is not a regular file"
  [ "$(cat "${f}")" = "$(expected_file "$1")" ] || fail "$2: wrong content: $(cat "${f}")"
}

# (1) no URL anywhere: 78, and no deploy dir
reset; run; got=$?; expect_refused "${got}" "no url"
[ ! -e "${WORK}/deploy" ] || fail "no url: a refusal created the deploy base"
grep -q 'TEC_TAC_API_URL' "${WORK}/err" || fail "the refusal does not name TEC_TAC_API_URL"

# (2) bad values: 78 and nothing written
bad_values=('ftp://x.test' 'api.example.com' 'https://' 'https://a b.test' 'https://a".test' 'https://a\b.test' 'https://$(id).test' 'https://`id`.test' $'https://a.test\nhttps://b.test' 'https://a.test/?x=1' 'https://a.test/#f' 'https://user:pw@a.test' 'https://a.test/<x>' "https://a'.test")
for v in "${bad_values[@]}"; do
  reset; run TEC_TAC_API_URL="${v}"; got=$?; expect_refused "${got}" "bad value '${v}'"
  [ ! -e "${WORK}/deploy" ] || fail "bad value '${v}' created the deploy base"
done

# (3) trailing slashes are removed; exact content
reset; run TEC_TAC_API_URL='https://api.example.com///' || fail "good url failed: $(cat "${WORK}/err")"
check_file 'https://api.example.com' "trailing slash"
reset; run TEC_TAC_API_URL='http://10.0.0.5:8000/prefix' || fail "http url with port and path failed"
check_file 'http://10.0.0.5:8000/prefix' "http with port"
# the file is world-readable where the platform reports real modes
if [ "$(uname -s | cut -c1-5)" = "Linux" ]; then
  [ "$(stat -c '%a' "${DEPLOY}/env-config.js")" = "644" ] || fail "mode is not 644"
fi

# (4) env beats tec-tac.conf beats the previous file
reset; mkdir -p "${DEPLOY}"; expected_file 'https://old.example.com' > "${DEPLOY}/env-config.js"
echo 'TEC_TAC_API_URL=https://conf.example.com' > "${CONF}"
run TEC_TAC_API_URL=https://env.example.com || fail "env run failed: $(cat "${WORK}/err")"
check_file 'https://env.example.com' "env wins"
reset; mkdir -p "${DEPLOY}"; expected_file 'https://old.example.com' > "${DEPLOY}/env-config.js"
echo 'TEC_TAC_API_URL=https://conf.example.com' > "${CONF}"
run || fail "conf run failed: $(cat "${WORK}/err")"
check_file 'https://conf.example.com' "conf beats previous"

# (5) reinstall with no env and no conf keeps the previous URL; bad previous files are ignored
reset; mkdir -p "${DEPLOY}"; expected_file 'https://old.example.com' > "${DEPLOY}/env-config.js"
run || fail "reinstall failed: $(cat "${WORK}/err")"
check_file 'https://old.example.com' "previous kept"
reset; mkdir -p "${DEPLOY}"; expected_file 'ftp://bad' > "${DEPLOY}/env-config.js"
run; [ $? = 78 ] || fail "an invalid previous file was used"
reset; mkdir -p "${DEPLOY}"; printf '<!doctype html>\n<html></html>\n' > "${DEPLOY}/env-config.js"
run; [ $? = 78 ] || fail "an html previous file was used"
reset; mkdir -p "${DEPLOY}"; expected_file 'https://link.example.com' > "${WORK}/real.js"
if ln -s "${WORK}/real.js" "${DEPLOY}/env-config.js" 2>/dev/null && [ -L "${DEPLOY}/env-config.js" ]; then
  run; [ $? = 78 ] || fail "a symlinked previous file was used"
fi

# (6) the staged tree already holds the file when sync-modules.sh runs
reset; run TEC_TAC_API_URL=https://api.example.com STAGED_COPY="${WORK}/staged.js" || fail "staged check failed: $(cat "${WORK}/err")"
[ "$(cat "${WORK}/staged.js")" = "$(expected_file 'https://api.example.com')" ] || fail "the staged file differs from the deployed one"

# (7) Q72 option b (Johan): with no address in the environment, tec-tac.conf or a previous UI file, the value is read from Tactical's
# env-config.js (read only). The UI writes its OWN file from the checked value; Tactical's file is neither copied nor changed.
reset; mkdir -p "${FRONTEND}"; expected_file 'https://tactical.example.com/' > "${FRONTEND}/env-config.js"
before="$(cat "${FRONTEND}/env-config.js")"
run NO_ENV_OK=1; got=$?
[ "${got}" = "0" ] || fail "tactical fallback: expected exit 0, got ${got}: $(cat "${WORK}/err")"
! grep -q 'REFUSED' "${WORK}/err" || fail "tactical fallback: printed REFUSED"
check_file 'https://tactical.example.com' "tactical fallback (trailing slash removed)"
[ "$(cat "${FRONTEND}/env-config.js")" = "${before}" ] || fail "tactical fallback: Tactical's file was changed"
grep -q "Source used: PROD_URL in Tactical's" "${WORK}/out" || fail "tactical fallback: the output does not name the source"
# a single-line Tactical file with quoted key is read too
reset; mkdir -p "${FRONTEND}"; printf 'window._env_ = { "PROD_URL": "https://one.example.com" }
' > "${FRONTEND}/env-config.js"
run; [ $? = 0 ] || fail "tactical single-line file failed: $(cat "${WORK}/err")"
check_file 'https://one.example.com' "tactical single-line"
# an invalid Tactical value is refused with nothing changed
reset; mkdir -p "${FRONTEND}"; expected_file 'ftp://bad.example.com' > "${FRONTEND}/env-config.js"
run NO_ENV_OK=1; got=$?; expect_refused "${got}" "tactical file with an invalid PROD_URL"
# the conf address beats Tactical's value
reset; mkdir -p "${FRONTEND}"; expected_file 'https://tactical.example.com' > "${FRONTEND}/env-config.js"
echo 'TEC_TAC_API_URL=https://conf.example.com' > "${CONF}"
run || fail "conf over tactical failed"; check_file 'https://conf.example.com' "conf beats tactical"
grep -q "Source used: ${CONF}" "${WORK}/out" || fail "conf source not named in the output"
# a Tactical file without a PROD_URL gives no address: refused
reset; mkdir -p "${FRONTEND}"; printf 'window._env_ = {};
' > "${FRONTEND}/env-config.js"
run NO_ENV_OK=1; got=$?; expect_refused "${got}" "tactical file without PROD_URL"
# an address given still wins and is written, whatever Tactical holds
reset; mkdir -p "${FRONTEND}"; expected_file 'https://tactical.example.com' > "${FRONTEND}/env-config.js"
run TEC_TAC_API_URL=https://api.example.com || fail "hosted with an address failed: $(cat "${WORK}/err")"
check_file 'https://api.example.com' "hosted with an address"
# standalone: no Tactical frontend and no address is refused
reset; run; got=$?; expect_refused "${got}" "standalone, no address"
reset; run TEC_TAC_API_URL=https://api.example.com || fail "install without a Tactical frontend failed: $(cat "${WORK}/err")"
check_file 'https://api.example.com' "no tactical frontend"

# (8) a deployed file replaced by index.html content: exit 1, no REFUSED line
reset; run TEC_TAC_API_URL=https://api.example.com CHOWN_CLOBBER="${WORK}/deploy"; got=$?
[ "${got}" = "1" ] || fail "a clobbered deployed file gave exit ${got}: $(cat "${WORK}/err")"
! grep -q 'REFUSED' "${WORK}/err" || fail "a post-deploy failure printed REFUSED"

# (10) repair-nginx.sh runs only where a Tactical frontend nginx block exists. A standalone host skips it and still succeeds (exit 0).
MARK="${WORK}/repair-mark"
NGCONF="${WORK}/frontend.conf"; NOCONF="${WORK}/no-such-frontend.conf"; SITES="${WORK}/sites-enabled"
mkdir -p "${SITES}"; echo 'server { }' > "${NGCONF}"
reset; rm -f "${MARK}"
run TEC_TAC_API_URL=https://api.example.com REPAIR_MARK="${MARK}" TACTICAL_FRONTEND_NGINX_CONF="${NOCONF}" TEC_TAC_NGINX_SITES_ENABLED="${SITES}" \
  || fail "standalone install (no Tactical nginx block) did not exit 0: $(cat "${WORK}/err")"
[ ! -e "${MARK}" ] || fail "standalone: repair-nginx.sh ran with no Tactical frontend block"
grep -q 'standalone host' "${WORK}/out" || fail "standalone: no log line about skipping the nginx include"
check_file 'https://api.example.com' "standalone nginx skip"
reset; rm -f "${MARK}"
run TEC_TAC_API_URL=https://api.example.com REPAIR_MARK="${MARK}" TACTICAL_FRONTEND_NGINX_CONF="${NGCONF}" \
  || fail "install with frontend.conf failed: $(cat "${WORK}/err")"
[ -e "${MARK}" ] || fail "frontend.conf present: repair-nginx.sh did not run"
reset; rm -f "${MARK}"; printf 'server {\n  root /var/www/rmm/dist;\n}\n' > "${SITES}/site.conf"
run TEC_TAC_API_URL=https://api.example.com REPAIR_MARK="${MARK}" TACTICAL_FRONTEND_NGINX_CONF="${NOCONF}" TEC_TAC_NGINX_SITES_ENABLED="${SITES}" \
  || fail "install with an enabled Tactical block failed: $(cat "${WORK}/err")"
[ -e "${MARK}" ] || fail "enabled Tactical block: repair-nginx.sh did not run"

echo "installer-env-config-0.12.113: PASS"
