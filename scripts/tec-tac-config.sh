#!/usr/bin/env bash
TEC_TAC_CONFIG_FILE="${TEC_TAC_CONFIG_FILE:-/opt/tec-tac/etc/tec-tac.conf}"
if [[ -f "${TEC_TAC_CONFIG_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${TEC_TAC_CONFIG_FILE}"
fi
TEC_TAC_ROOT="${TEC_TAC_ROOT:-/opt/tec-tac}"
TEC_TAC_EXTENSIONS_ROOT="${TEC_TAC_EXTENSIONS_ROOT:-${TEC_TAC_ROOT}/extensions}"
TEC_TAC_UI_DEPLOY_ROOT="${TEC_TAC_UI_DEPLOY_ROOT:-/var/lib/tec-tac/ui/tec-tac}"
TEC_TAC_UI_DEPLOY_BASE="${TEC_TAC_UI_DEPLOY_BASE:-$(dirname "${TEC_TAC_UI_DEPLOY_ROOT}")}"
# Content-Security-Policy for /tec-tac/: report-only (default), enforce or off.
# report-only blocks nothing; it only logs. Switch to enforce with TEC_TAC_CSP_MODE=enforce.
# The EXTRA settings are space-separated hosts that widen connect-src, frame-src
# and img-src, for example TEC_TAC_CSP_FRAME_EXTRA="https://mesh.example.com".
TEC_TAC_CSP_MODE="${TEC_TAC_CSP_MODE:-report-only}"
TEC_TAC_CSP_CONNECT_EXTRA="${TEC_TAC_CSP_CONNECT_EXTRA:-}"
TEC_TAC_CSP_FRAME_EXTRA="${TEC_TAC_CSP_FRAME_EXTRA:-}"
TEC_TAC_CSP_IMG_EXTRA="${TEC_TAC_CSP_IMG_EXTRA:-}"
