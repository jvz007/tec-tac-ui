#!/usr/bin/env bash
# 0.12.83: the policy builder and the UI agree on the API origin for any PROD_URL.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "[TEST] FAIL: $*" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
# shellcheck source=/dev/null
source "${ROOT}/scripts/tec-tac-csp.sh"

for url in 'https://api.x.test' 'https://api.x.test/' 'https://api.x.test:8443' 'https://api.x.test:443/api/v1' \
           'HTTPS://API.X.test' 'http://10.0.0.5:8000' 'https://[::1]:8000' 'https://api.x.test/a?b=1' \
           'https://api.x.test#frag' 'http://api.x.test:80' 'https://user:pw@api.x.test:8443/p'; do
  printf 'window._env_ = { PROD_URL: "%s" }\n' "${url}" > "${TMP}/env-config.js"
  LINE="$(tec_tac_csp_from_env_config enforce "${TMP}/env-config.js" 2>"${TMP}/warn.txt")"
  [[ -n "${LINE}" ]] || fail "no policy for PROD_URL ${url}: $(cat "${TMP}/warn.txt")"
  POLICY="${LINE#add_header Content-Security-Policy \"}"
  POLICY="${POLICY%\" always;}"
  node "${ROOT}/tests/csp-match-helper-0.12.83.mjs" "${POLICY}" "${url}" || fail "policy and UI request disagree for ${url}"
  grep -Fq 'pw@' <<<"${LINE}" && fail "userinfo reached the policy for ${url}"
done

# Normalised shapes.
printf 'window._env_ = { PROD_URL: "HTTPS://API.X.test:443/x?y=1#z" }\n' > "${TMP}/env-config.js"
LINE="$(tec_tac_csp_from_env_config enforce "${TMP}/env-config.js" 2>/dev/null)"
grep -Fq "connect-src 'self' https://api.x.test wss://api.x.test;" <<<"${LINE}" || fail "origin not normalised: ${LINE}"

# Injection strings still yield no header, and ; or quotes never reach the policy.
for bad in 'https://x.test";}; evil' "https://x.test'; script-src *" 'https://x.test;frame-src *' 'https://x.test/a?b="1"' 'https://x.test/ a' 'javascript:alert(1)'; do
  printf 'window._env_ = { PROD_URL: "%s" }\n' "${bad//\"/\\\"}" > "${TMP}/env-config.js"
  LINE="$(tec_tac_csp_from_env_config enforce "${TMP}/env-config.js" 2>/dev/null)"
  # Either no header, or (when the quote ends the value early) a header for the
  # clean part only. Nothing after the quote or semicolon may reach the policy.
  grep -Eq "evil|script-src \*|frame-src \*|unsafe-eval" <<<"${LINE}" && fail "unsafe PROD_URL reached the policy: ${bad}"
  [[ -z "${LINE}" ]] || grep -Fq "script-src 'self'; style-src" <<<"${LINE}" || fail "script-src changed by: ${bad}"
done
printf "window._env_ = { PROD_URL: 'https://x.test/a;b' }\n" > "${TMP}/env-config.js"
[[ -z "$(tec_tac_csp_from_env_config enforce "${TMP}/env-config.js" 2>/dev/null)" ]] || fail "semicolon in PROD_URL produced a header"

# apiBase(): trims trailing slashes only; empty when unset.
grep -Fq "String(window._env_?.PROD_URL || '').replace(/\/+\$/, '')" "${ROOT}/src/api.js" || fail "apiBase() does not trim trailing slashes"
(cd "${ROOT}" && node --input-type=module -e "
import { apiBase } from './src/api.js'
globalThis.window = { _env_: {} }
if (apiBase() !== '') throw new Error('unset PROD_URL must give empty string')
window._env_.PROD_URL = 'https://h.test//'
if (apiBase() !== 'https://h.test') throw new Error('trailing slashes not trimmed')
window._env_.PROD_URL = 'https://h.test:8443/api'
if (apiBase() !== 'https://h.test:8443/api') throw new Error('apiBase changed more than the trailing slash')
globalThis.window = {}
if (apiBase() !== '') throw new Error('no _env_ must give empty string')
") || fail "apiBase() behaviour"
echo "[TEST] PASS CSP PROD_URL handling"
