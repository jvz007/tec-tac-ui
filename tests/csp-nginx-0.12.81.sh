#!/usr/bin/env bash
# 0.12.81: Content-Security-Policy in the Tec-Tac nginx snippet.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "[TEST] FAIL: $*" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

bash -n "${ROOT}/scripts/tec-tac-csp.sh" || fail "tec-tac-csp.sh has a syntax error"
bash -n "${ROOT}/scripts/repair-nginx.sh" || fail "repair-nginx.sh has a syntax error"
bash -n "${ROOT}/scripts/tec-tac-config.sh" || fail "tec-tac-config.sh has a syntax error"

# shellcheck source=/dev/null
source "${ROOT}/scripts/tec-tac-csp.sh"

printf 'window._env_ = { PROD_URL: "https://api.tcrm.example.test/", APP_URL: "x" }\n' > "${TMP}/env-config.js"
LINE="$(tec_tac_csp_from_env_config enforce "${TMP}/env-config.js" 2>/dev/null)"

[[ "${LINE}" == add_header\ Content-Security-Policy\ \"*\"\ always\; ]] || fail "enforce directive has the wrong shape: ${LINE}"
grep -Fq "default-src 'self'" <<<"${LINE}" || fail "default-src 'self' missing"
SCRIPT_SRC="$(grep -o "script-src [^;]*;" <<<"${LINE}")"
[[ "${SCRIPT_SRC}" == "script-src 'self';" ]] || fail "script-src must be 'self' only: ${SCRIPT_SRC}"
grep -Fq "unsafe-eval" <<<"${LINE}" && fail "unsafe-eval must not appear"
# unsafe-inline is allowed in style-src only.
grep -o "[a-z-]*-src [^;]*unsafe-inline" <<<"${LINE}" | grep -vq '^style-src' && fail "unsafe-inline outside style-src"
grep -Fq "connect-src 'self' https://api.tcrm.example.test wss://api.tcrm.example.test" <<<"${LINE}" || fail "connect-src lacks the API origin and its wss form"
grep -Fq "object-src 'none'" <<<"${LINE}" || fail "object-src 'none' missing"
grep -Fq "frame-ancestors 'self'" <<<"${LINE}" || fail "frame-ancestors 'self' missing"
grep -Fq "base-uri 'self'" <<<"${LINE}" || fail "base-uri 'self' missing"
grep -Fq "worker-src 'self' blob:" <<<"${LINE}" || fail "worker-src missing blob:"
grep -Fq "frame-src 'self' blob: https:" <<<"${LINE}" || fail "frame-src missing"
grep -Fq "img-src 'self' data: blob:" <<<"${LINE}" || fail "img-src missing"
grep -Fq "form-action" <<<"${LINE}" && fail "form-action would block the SSO redirect"

# report-only switches the header name.
REPORT="$(tec_tac_csp_from_env_config report-only "${TMP}/env-config.js" 2>/dev/null)"
[[ "${REPORT}" == add_header\ Content-Security-Policy-Report-Only\ * ]] || fail "report-only header name wrong"

# off, an unreadable file and a non-http(s) PROD_URL yield no header.
[[ -z "$(tec_tac_csp_from_env_config off "${TMP}/env-config.js" 2>/dev/null)" ]] || fail "mode off wrote a header"
[[ -z "$(tec_tac_csp_from_env_config enforce "${TMP}/missing.js" 2>/dev/null)" ]] || fail "unreadable env-config wrote a header"
printf 'window._env_ = { PROD_URL: "javascript:alert(1)" }\n' > "${TMP}/bad.js"
[[ -z "$(tec_tac_csp_from_env_config enforce "${TMP}/bad.js" 2>/dev/null)" ]] || fail "non-http PROD_URL wrote a header"
printf 'window._env_ = { PROD_URL: "https://x.test\\";}; evil" }\n' > "${TMP}/inject.js"
[[ -z "$(tec_tac_csp_from_env_config enforce "${TMP}/inject.js" 2>/dev/null)" ]] || fail "unsafe PROD_URL characters reached the policy"
tec_tac_csp_from_env_config enforce "${TMP}/missing.js" 2>&1 >/dev/null | grep -q "no Content-Security-Policy written" || fail "unreadable env-config did not log a warning"

# Extra sources widen the policy; unsafe tokens are dropped.
WIDE="$(TEC_TAC_CSP_FRAME_EXTRA="https://mesh.example.test 'unsafe-inline'" TEC_TAC_CSP_IMG_EXTRA="https://img.example.test" TEC_TAC_CSP_CONNECT_EXTRA="wss://mesh.example.test" tec_tac_csp_from_env_config enforce "${TMP}/env-config.js" 2>/dev/null)"
grep -Fq "frame-src 'self' blob: https: https://mesh.example.test;" <<<"${WIDE}" || fail "frame extra not applied"
grep -Fq "img-src 'self' data: blob: https://api.tcrm.example.test https://img.example.test;" <<<"${WIDE}" || fail "img extra not applied"
grep -Fq "wss://mesh.example.test;" <<<"${WIDE}" || fail "connect extra not applied"
grep -Fq "unsafe-inline" <<<"$(grep -o "frame-src [^;]*;" <<<"${WIDE}")" && fail "an extra source smuggled in unsafe-inline"

# The defaults and the nginx snippet.
grep -q 'TEC_TAC_CSP_MODE="${TEC_TAC_CSP_MODE:-enforce}"' "${ROOT}/scripts/tec-tac-config.sh" || fail "CSP mode default missing"
REPAIR="${ROOT}/scripts/repair-nginx.sh"
grep -q 'tec-tac-csp.sh' "${REPAIR}" || fail "repair-nginx.sh does not load the CSP builder"
grep -q 'TACTICAL_FRONTEND_ROOT:-/var/www/rmm/dist' "${REPAIR}" || fail "env-config.js location not configurable"
grep -q 'env-config.js' "${REPAIR}" || fail "repair-nginx.sh does not read env-config.js"
grep -q 'nginx -t' "${REPAIR}" || fail "nginx -t validation missing"
grep -q 'cp -a "${BACKUP}" "${FRONTEND_CONF}"' "${REPAIR}" || fail "restore-on-failure missing"
for location in 'location = /tec-tac/index.html' 'location ^~ /tec-tac/'; do
  block="$(awk -v loc="${location}" 'index($0, loc) == 1 { on = 1 } on { print } on && /^}/ { exit }' "${REPAIR}")"
  [[ -n "${block}" ]] || fail "${location} block not found"
  grep -Fq '${CSP_LINE}' <<<"${block}" || fail "${location} lacks the CSP directive"
done
grep -q 'add_header Content-Security-Policy' "${REPAIR}" && fail "the directive must come from tec-tac-csp.sh, not be hard coded"


# 0.12.82: nginx only inherits the server-level add_header (Tactical's nosniff)
# into a location that has none, so every Tec-Tac location that adds a header
# must repeat nosniff, in every CSP mode.
grep -Fq "NOSNIFF_LINE='add_header X-Content-Type-Options nosniff always;'" "${REPAIR}" || fail "NOSNIFF_LINE not defined"
for location in 'location = /tec-tac/index.html' 'location = /tec-tac/modules/modules.json' 'location ^~ /tec-tac/'; do
  block="$(awk -v loc="${location}" 'index($0, loc) == 1 { on = 1 } on { print } on && /^}/ { exit }' "${REPAIR}")"
  [[ -n "${block}" ]] || fail "${location} block not found"
  grep -Fq '${NOSNIFF_LINE}' <<<"${block}" || fail "${location} lacks nosniff"
done
grep -Fq 'nosniff' "${ROOT}/scripts/tec-tac-csp.sh" && fail "nosniff belongs in repair-nginx.sh, not the CSP builder"

# Render the snippet for real, with and without a CSP line.
awk '/<<EOF_SNIPPET$/ { on = 1; next } /^EOF_SNIPPET$/ { on = 0 } on { print }' "${REPAIR}" > "${TMP}/snippet.tpl"
[[ -s "${TMP}/snippet.tpl" ]] || fail "snippet template not found"
render_snippet() {
  local DEPLOY_BASE=/opt/x CSP_LINE="$1" NOSNIFF_LINE
  NOSNIFF_LINE="$(sed -n "s/^NOSNIFF_LINE='\(.*\)'\$/\1/p" "${REPAIR}")"
  eval "cat <<EOF_RENDER
$(cat "${TMP}/snippet.tpl")
EOF_RENDER"
}
check_rendered() {
  awk '
    /^location / { hdr = 0; nos = 0; name = $0 }
    /add_header/ { hdr = 1 }
    /add_header X-Content-Type-Options nosniff always;/ { nos = 1 }
    /^}/ { if (hdr) { n++; if (!nos) { print "missing nosniff: " name; bad = 1 } } }
    END { if (n != 3) { print "expected 3 header locations, saw " n; bad = 1 } exit bad }' <<<"$2" || fail "$1: a location with add_header lacks nosniff"
}
WITH_CSP="$(render_snippet 'add_header Content-Security-Policy "default-src self" always;')"
NO_CSP="$(render_snippet '')"
check_rendered "csp on" "${WITH_CSP}"
check_rendered "csp off" "${NO_CSP}"
grep -q 'Content-Security-Policy' <<<"${NO_CSP}" && fail "no CSP line expected when none is built"
[[ "$(grep -c 'X-Content-Type-Options nosniff always;' <<<"${NO_CSP}")" == 3 ]] || fail "nosniff must be in all three locations without a CSP line"
echo "[TEST] PASS Content-Security-Policy nginx snippet"
