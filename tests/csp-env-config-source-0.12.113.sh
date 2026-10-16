#!/usr/bin/env bash
# 0.12.113: the CSP reads the API origin from the file the browser really loads for <script src="/env-config.js">.
# Integrated layout (Tactical's frontend root exists): that is Tactical's file, never the UI's own /tec-tac/env-config.js.
# Standalone layout (no Tactical frontend root): the UI's file. Renders the real snippet through repair-nginx.sh with stubs.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "[TEST] FAIL: csp-env-config-source-0.12.113: $*" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
# shellcheck source=/dev/null
source "${ROOT}/scripts/tec-tac-csp.sh"
gen() { printf 'window._env_ = {\n  PROD_URL: "%s"\n};\n' "$2" > "$1"; }

# index.html loads the file from the site root, which is what the helper models
grep -q '<script src="/env-config.js">' "${ROOT}/index.html" || fail "index.html no longer loads /env-config.js from the site root"

# helper: integrated layout uses Tactical's file only
mkdir -p "${TMP}/ui" "${TMP}/tactical"
gen "${TMP}/ui/env-config.js" "https://ui-api.example.test"
gen "${TMP}/tactical/env-config.js" "https://tactical-api.example.test"
[ "$(tec_tac_csp_env_config_path "${TMP}/ui" "${TMP}/tactical")" = "${TMP}/tactical/env-config.js" ] || fail "integrated: Tactical's file is not the source"
printf 'window._env_ = {};\n' > "${TMP}/tactical/env-config.js"
[ -z "$(tec_tac_csp_env_config_path "${TMP}/ui" "${TMP}/tactical")" ] || fail "integrated: the UI file was used while Tactical's has no PROD_URL"
rm -f "${TMP}/tactical/env-config.js"
[ -z "$(tec_tac_csp_env_config_path "${TMP}/ui" "${TMP}/tactical")" ] || fail "integrated: the UI file was used while Tactical's is missing"
# standalone: no frontend root
[ "$(tec_tac_csp_env_config_path "${TMP}/ui" "${TMP}/no-such-root")" = "${TMP}/ui/env-config.js" ] || fail "standalone: the UI file is not the source"
printf 'window._env_ = {};\n' > "${TMP}/ui/env-config.js"
[ -z "$(tec_tac_csp_env_config_path "${TMP}/ui" "${TMP}/no-such-root")" ] || fail "standalone: a path was printed for an unusable file"

# render the snippet with repair-nginx.sh (root test swapped, nginx, systemctl and python3 stubbed)
mkdir -p "${TMP}/stubs" "${TMP}/tree/scripts"
for n in nginx systemctl python3 chown; do printf '#!/usr/bin/env bash\nexit 0\n' > "${TMP}/stubs/${n}"; chmod +x "${TMP}/stubs/${n}"; done
sed 's/^\[\[ \${EUID} -eq 0 \]\] || fail "Run as root."$/true/' "${ROOT}/scripts/repair-nginx.sh" > "${TMP}/tree/scripts/repair-nginx.sh"
grep -q '^true$' "${TMP}/tree/scripts/repair-nginx.sh" || fail "the root test was not swapped"
cp "${ROOT}/scripts/tec-tac-config.sh" "${ROOT}/scripts/tec-tac-csp.sh" "${TMP}/tree/scripts/"
printf 'server {\n  root /var/www/rmm/dist;\n}\n' > "${TMP}/frontend.conf"
render() { # render <ui-root> <frontend-root>; prints the snippet's connect-src line, stderr to ${TMP}/err
  rm -f "${TMP}/snip/tec-tac.conf"
  env HOME="${TMP}" PATH="${TMP}/stubs:${PATH}" TEC_TAC_CONFIG_FILE="${TMP}/none.conf" TEC_TAC_UI_ROOT="$1" TEC_TAC_UI_DEPLOY_BASE="${TMP}" \
    TACTICAL_FRONTEND_ROOT="$2" TACTICAL_FRONTEND_NGINX_CONF="${TMP}/frontend.conf" TEC_TAC_NGINX_SNIPPET_DIR="${TMP}/snip" TEC_TAC_CSP_MODE=enforce \
    bash "${TMP}/tree/scripts/repair-nginx.sh" > "${TMP}/out" 2> "${TMP}/err" || fail "repair-nginx.sh failed: $(cat "${TMP}/out" "${TMP}/err")"
  grep -o "connect-src [^;]*" "${TMP}/snip/tec-tac.conf" | head -n1
}
rm -rf "${TMP}/ui" "${TMP}/tactical"; mkdir -p "${TMP}/ui" "${TMP}/tactical"; : > "${TMP}/ui/index.html"

# different PROD_URLs: the policy carries the origin of the file the page loads (Tactical's), not the UI file's
gen "${TMP}/ui/env-config.js" "https://typo-api.example.test"
gen "${TMP}/tactical/env-config.js" "https://real-api.example.test"
got="$(render "${TMP}/ui" "${TMP}/tactical")"
case "${got}" in *"https://real-api.example.test wss://real-api.example.test"*) ;; *) fail "connect-src lacks the origin the page uses: ${got}" ;; esac
case "${got}" in *typo-api*) fail "connect-src carries the UI file's origin: ${got}" ;; esac
grep -q 'typo-api' "${TMP}/snip/tec-tac.conf" && fail "the snippet mentions the UI file's origin"
grep -q 'Note: .*names https://typo-api.example.test' "${TMP}/out" || fail "no note about the differing files"

# Tactical's file unusable in an integrated layout: no policy at all, never one built from the UI file
printf 'window._env_ = {};\n' > "${TMP}/tactical/env-config.js"
render "${TMP}/ui" "${TMP}/tactical" > /dev/null
! grep -q 'Content-Security-Policy' "${TMP}/snip/tec-tac.conf" || fail "a policy was written from a file the page does not load"

# standalone (no Tactical frontend root): the UI's own file
gen "${TMP}/ui/env-config.js" "https://standalone-api.example.test/"
got="$(render "${TMP}/ui" "${TMP}/no-such-root")"
case "${got}" in *"https://standalone-api.example.test wss://standalone-api.example.test"*) ;; *) fail "standalone: connect-src lacks the UI file's origin: ${got}" ;; esac

echo "csp-env-config-source-0.12.113: PASS"
