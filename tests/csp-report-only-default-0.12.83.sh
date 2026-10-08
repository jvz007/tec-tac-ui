#!/usr/bin/env bash
# 0.12.83: Content-Security-Policy is report-only by default; enforce is opt-in.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "[TEST] FAIL: $*" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

# With no mode set and no config file, the shipped default is report-only.
MODE="$(env -u TEC_TAC_CSP_MODE TEC_TAC_CONFIG_FILE="${TMP}/none.conf" bash -c 'source "$1"; printf %s "${TEC_TAC_CSP_MODE}"' _ "${ROOT}/scripts/tec-tac-config.sh")"
[[ "${MODE}" == "report-only" ]] || fail "default mode is '${MODE}', expected report-only"
# An explicit setting still wins.
MODE="$(TEC_TAC_CSP_MODE=enforce TEC_TAC_CONFIG_FILE="${TMP}/none.conf" bash -c 'source "$1"; printf %s "${TEC_TAC_CSP_MODE}"' _ "${ROOT}/scripts/tec-tac-config.sh")"
[[ "${MODE}" == "enforce" ]] || fail "TEC_TAC_CSP_MODE=enforce was not honoured"

# shellcheck source=/dev/null
source "${ROOT}/scripts/tec-tac-csp.sh"
printf 'window._env_ = { PROD_URL: "https://api.tcrm.example.test" }\n' > "${TMP}/env-config.js"

DEFAULT="$(tec_tac_csp_from_env_config "" "${TMP}/env-config.js" 2>/dev/null)"
[[ "${DEFAULT}" == add_header\ Content-Security-Policy-Report-Only\ * ]] || fail "no mode argument must emit the report-only header: ${DEFAULT}"
[[ "$(tec_tac_csp_header_name)" == "Content-Security-Policy-Report-Only" ]] || fail "header name default is not report-only"

UNKNOWN="$(tec_tac_csp_from_env_config bogus "${TMP}/env-config.js" 2>"${TMP}/warn.txt")"
[[ "${UNKNOWN}" == add_header\ Content-Security-Policy-Report-Only\ * ]] || fail "an unknown mode must fall back to report-only"
grep -q "using report-only" "${TMP}/warn.txt" || fail "an unknown mode must warn"

ENFORCE="$(tec_tac_csp_from_env_config enforce "${TMP}/env-config.js" 2>/dev/null)"
[[ "${ENFORCE}" == add_header\ Content-Security-Policy\ \"* ]] || fail "enforce must emit Content-Security-Policy"
[[ -z "$(tec_tac_csp_from_env_config off "${TMP}/env-config.js" 2>/dev/null)" ]] || fail "off must emit nothing"

# nosniff stays in all three locations in the rendered snippet.
REPAIR="${ROOT}/scripts/repair-nginx.sh"
awk '/<<EOF_SNIPPET$/ { on = 1; next } /^EOF_SNIPPET$/ { on = 0 } on { print }' "${REPAIR}" > "${TMP}/snippet.tpl"
DEPLOY_BASE=/opt/x CSP_LINE="${DEFAULT}" NOSNIFF_LINE="$(sed -n "s/^NOSNIFF_LINE='\(.*\)'\$/\1/p" "${REPAIR}")" \
  bash -c 'eval "cat <<EOF_RENDER
$(cat "$1")
EOF_RENDER"' _ "${TMP}/snippet.tpl" > "${TMP}/rendered.conf"
[[ "$(grep -c 'X-Content-Type-Options nosniff always;' "${TMP}/rendered.conf")" == 3 ]] || fail "nosniff must be in all three locations"
grep -q 'Content-Security-Policy-Report-Only' "${TMP}/rendered.conf" || fail "rendered snippet lacks the report-only header"

# repair-nginx.sh says what the mode means.
grep -q 'report-only blocks nothing' "${REPAIR}" || fail "repair-nginx.sh does not explain report-only"
grep -q 'TEC_TAC_CSP_MODE=enforce' "${REPAIR}" || fail "repair-nginx.sh does not say how to enforce"

# README and Help.
grep -q 'report-only` (default)' "${ROOT}/README.md" || fail "README does not list report-only as the default"
grep -q 'no `\[Report Only\]` lines' "${ROOT}/README.md" || fail "README lacks the enforce checklist"
HELP="${ROOT}/src/help/articles/troubleshooting-diagnostics.md"
grep -q '## Browser security policy' "${HELP}" || fail "Help lacks the Browser security policy section"
grep -qi 'report-only' "${HELP}" || fail "Help does not mention report-only"
grep -q 'TEC_TAC_CSP_MODE=enforce' "${HELP}" || fail "Help does not say how to switch to enforce"
echo "[TEST] PASS CSP report-only default"
