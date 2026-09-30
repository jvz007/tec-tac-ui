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
