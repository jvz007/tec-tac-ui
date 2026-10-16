#!/usr/bin/env bash
# 0.12.115: a host that has Tactical's frontend root but no findable nginx block is refused (78) before the first live change,
# not reported as standalone. repair-nginx.sh reads TEC_TAC_NGINX_SITES_ENABLED. The install.sh header lists four env-config sources.
# Runs a copy of install.sh with only the root test swapped, in a temp tree, with stub npm, sync-modules.sh and repair-nginx.sh.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
fail() { echo "installer-nginx-block-0.12.115: FAIL: $*" >&2; exit 1; }
INSTALL="${HERE}/scripts/install.sh"
REPAIR="${HERE}/scripts/repair-nginx.sh"

bash -n "${INSTALL}" || fail "bash -n install.sh"
bash -n "${REPAIR}" || fail "bash -n repair-nginx.sh"

# (a) the header comment: four numbered sources, read only, never copied
re_line="$(grep -n '^API_URL_RE=' "${INSTALL}" | head -1 | cut -d: -f1)"
[ -n "${re_line}" ] || fail "cannot find API_URL_RE"
header="$(head -n "${re_line}" "${INSTALL}")"
! printf '%s' "${header}" | grep -q 'is never the source' || fail "the old header sentence is still there"
for n in 1 2 3 4; do printf '%s' "${header}" | grep -q "(${n})" || fail "the header does not number source (${n})"; done
printf '%s' "${header}" | grep -q 'read only' || fail "the header does not say read only"
printf '%s' "${header}" | grep -q 'never copied' || fail "the header does not say never copied"

# (b) static: the decision comes before the first live change; repair-nginx.sh uses the one setting
live_line="$(grep -n 'mkdir -p "${DEPLOY_BASE}"' "${INSTALL}" | head -1 | cut -d: -f1)"
dec_line="$(grep -n '^HAS_TACTICAL_NGINX=0' "${INSTALL}" | head -1 | cut -d: -f1)"
[ -n "${live_line}" ] && [ -n "${dec_line}" ] && [ "${dec_line}" -lt "${live_line}" ] || fail "the nginx decision is not before the first live change"
grep -q 'TEC_TAC_NGINX_SITES_ENABLED' "${REPAIR}" || fail "repair-nginx.sh ignores TEC_TAC_NGINX_SITES_ENABLED"
! grep -q ' /etc/nginx/sites-enabled 2>' "${REPAIR}" || fail "repair-nginx.sh still hard-codes sites-enabled in the search"

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
NOCONF="${WORK}/no-such-frontend.conf"
NGCONF="${WORK}/frontend.conf"
SITES="${WORK}/sites-enabled"
MARK="${WORK}/repair-mark"
mkdir -p "${SITES}"; echo 'server { }' > "${NGCONF}"

cat > "${WORK}/stubs/npm" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "run" ] && [ "$2" = "build" ]; then mkdir -p dist && echo '<html>ok</html>' > dist/index.html; fi
exit 0
STUB
printf '#!/usr/bin/env bash\nexit 0\n' > "${WORK}/stubs/chown"
chmod +x "${WORK}/stubs/npm" "${WORK}/stubs/chown"
printf '#!/usr/bin/env bash\nexit 0\n' > "${TREE}/scripts/sync-modules.sh"
printf '#!/usr/bin/env bash\necho called >> "${REPAIR_MARK:-/dev/null}"\nexit 0\n' > "${TREE}/scripts/repair-nginx.sh"

BASE_PATH=""
IFS=':' read -r -a dirs <<< "${PATH}"
for d in "${dirs[@]}"; do
  [ -n "${d}" ] || continue
  if [ -e "${d}/npm" ] || [ -e "${d}/npm.cmd" ] || [ -e "${d}/npm.exe" ]; then continue; fi
  BASE_PATH="${BASE_PATH:+${BASE_PATH}:}${d}"
done
run() {
  env -u TEC_TAC_API_URL HOME="${WORK}" PATH="${WORK}/stubs:${BASE_PATH}" TEC_TAC_CONFIG_FILE="${CONF}" TEC_TAC_UI_DEPLOY_ROOT="${DEPLOY}" \
    TACTICAL_FRONTEND_ROOT="${FRONTEND}" REPAIR_MARK="${MARK}" TEC_TAC_API_URL=https://api.example.com "$@" \
    bash "${TREE}/scripts/install.sh" > "${WORK}/out" 2> "${WORK}/err"
  return $?
}
reset() { rm -rf "${WORK}/deploy" "${FRONTEND}" "${MARK}"; : > "${CONF}"; rm -f "${SITES}"/*; }

# (1) frontend root exists, no block anywhere: refused, nothing changed, no success line
reset; mkdir -p "${FRONTEND}"
run TACTICAL_FRONTEND_NGINX_CONF="${NOCONF}" TEC_TAC_NGINX_SITES_ENABLED="${SITES}"; got=$?
[ "${got}" = "78" ] || fail "(1) expected exit 78, got ${got}: $(cat "${WORK}/err")"
grep -q '^\[TEC-TAC-INSTALL\] REFUSED: ' "${WORK}/err" || fail "(1) no REFUSED line"
grep -q 'TACTICAL_FRONTEND_NGINX_CONF' "${WORK}/err" || fail "(1) the refusal does not name TACTICAL_FRONTEND_NGINX_CONF"
grep -q 'TEC_TAC_NGINX_SITES_ENABLED' "${WORK}/err" || fail "(1) the refusal does not name TEC_TAC_NGINX_SITES_ENABLED"
[ ! -e "${WORK}/deploy" ] || fail "(1) the deploy base was touched"
[ ! -e "${MARK}" ] || fail "(1) repair-nginx.sh ran"
! grep -q 'Installed tec-tac-ui' "${WORK}/out" || fail "(1) a success line was printed"

# (2) frontend root absent and no block: standalone, success, include skipped
reset
run TACTICAL_FRONTEND_NGINX_CONF="${NOCONF}" TEC_TAC_NGINX_SITES_ENABLED="${SITES}" || fail "(2) standalone failed: $(cat "${WORK}/err")"
grep -q 'standalone host' "${WORK}/out" || fail "(2) no standalone log line"
[ ! -e "${MARK}" ] || fail "(2) repair-nginx.sh ran on a standalone host"

# (3) frontend root and frontend.conf: repair runs
reset; mkdir -p "${FRONTEND}"
run TACTICAL_FRONTEND_NGINX_CONF="${NGCONF}" TEC_TAC_NGINX_SITES_ENABLED="${SITES}" || fail "(3) failed: $(cat "${WORK}/err")"
[ -e "${MARK}" ] || fail "(3) repair-nginx.sh did not run"

# (4) frontend root, no frontend.conf, enabled block serving the dist root: repair runs
reset; mkdir -p "${FRONTEND}"; printf 'server {\n  root /var/www/rmm/dist;\n}\n' > "${SITES}/site.conf"
run TACTICAL_FRONTEND_NGINX_CONF="${NOCONF}" TEC_TAC_NGINX_SITES_ENABLED="${SITES}" || fail "(4) failed: $(cat "${WORK}/err")"
[ -e "${MARK}" ] || fail "(4) repair-nginx.sh did not run"

# (5) repair-nginx.sh itself, real copy with stubs
R="${WORK}/r"
mkdir -p "${R}/scripts" "${R}/stubs" "${R}/ui"
for n in nginx systemctl python3 chown; do printf '#!/usr/bin/env bash\nexit 0\n' > "${R}/stubs/${n}"; chmod +x "${R}/stubs/${n}"; done
sed 's/^\[\[ \${EUID} -eq 0 \]\] || fail "Run as root."$/true/' "${REPAIR}" > "${R}/scripts/repair-nginx.sh"
grep -q '^true$' "${R}/scripts/repair-nginx.sh" || fail "(5) the root test was not swapped"
cp "${HERE}/scripts/tec-tac-config.sh" "${HERE}/scripts/tec-tac-csp.sh" "${R}/scripts/"
: > "${R}/ui/index.html"
rn() {
  env HOME="${R}" PATH="${R}/stubs:${PATH}" TEC_TAC_CONFIG_FILE="${R}/none.conf" TEC_TAC_UI_ROOT="${R}/ui" TEC_TAC_UI_DEPLOY_BASE="${R}" \
    TACTICAL_FRONTEND_ROOT="${R}/no-root" TACTICAL_FRONTEND_NGINX_CONF="${NOCONF}" TEC_TAC_NGINX_SNIPPET_DIR="${R}/snip" "$@" \
    bash "${R}/scripts/repair-nginx.sh" > "${R}/out" 2> "${R}/err"
}
CUSTOM="${R}/custom-sites"; mkdir -p "${CUSTOM}"; printf 'server {\n  root /var/www/rmm/dist;\n}\n' > "${CUSTOM}/site.conf"
rn TEC_TAC_NGINX_SITES_ENABLED="${CUSTOM}" || { grep -q 'Could not locate' "${R}/err" && fail "(5) the custom sites folder was not searched"; fail "(5) failed: $(cat "${R}/err")"; }
EMPTY="${R}/empty-sites"; mkdir -p "${EMPTY}"
rn TEC_TAC_NGINX_SITES_ENABLED="${EMPTY}"; got=$?
[ "${got}" != "0" ] || fail "(5) an empty sites folder did not fail"
grep -q 'Could not locate' "${R}/err" || fail "(5) the failure message changed: $(cat "${R}/err")"

echo "installer-nginx-block-0.12.115: PASS"
