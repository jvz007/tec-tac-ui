#!/usr/bin/env bash
# 0.12.115: the install.sh header comment lists the four env-config sources in order, as the README does, and says Tactical's
# file is read only and never copied. Comment-only change: the existing installer tests run unchanged to prove the behaviour.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "installer-header-0.12.115: FAIL: $*" >&2; exit 1; }
INSTALL="${HERE}/scripts/install.sh"

bash -n "${INSTALL}" || fail "bash -n install.sh"
re_line="$(grep -n '^API_URL_RE=' "${INSTALL}" | head -1 | cut -d: -f1)"
[ -n "${re_line}" ] || fail "cannot find API_URL_RE"
header="$(head -n "${re_line}" "${INSTALL}")"
! printf '%s' "${header}" | grep -q 'is never the source' || fail "the old header sentence is still there"
for n in 1 2 3 4; do printf '%s' "${header}" | grep -q "(${n})" || fail "the header does not number source (${n})"; done
printf '%s' "${header}" | grep -q 'read only' || fail "the header does not say read only"
printf '%s' "${header}" | grep -q 'never copied' || fail "the header does not say never copied"
# the four sources appear in the same order as in the README
o1="$(printf '%s' "${header}" | grep -ob "(1) the caller" | head -1 | cut -d: -f1)"
o2="$(printf '%s' "${header}" | grep -ob "(2) TEC_TAC_API_URL in tec-tac.conf" | head -1 | cut -d: -f1)"
o3="$(printf '%s' "${header}" | grep -ob "(3) the PROD_URL" | head -1 | cut -d: -f1)"
o4="$(printf '%s' "${header}" | grep -ob "(4) the PROD_URL in Tactical" | head -1 | cut -d: -f1)"
[ -n "${o1}" ] && [ -n "${o2}" ] && [ -n "${o3}" ] && [ -n "${o4}" ] || fail "a source is missing from the header"
[ "${o1}" -lt "${o2}" ] && [ "${o2}" -lt "${o3}" ] && [ "${o3}" -lt "${o4}" ] || fail "the sources are out of order"
grep -q 'the installed' "${INSTALL}" || fail "source 3 does not name the installed file"

bash "${HERE}/tests/installer-env-config-0.12.113.sh" || exit 1
bash "${HERE}/tests/installer-refusal-0.12.112.sh" || exit 1
echo "installer-header-0.12.115: PASS"
