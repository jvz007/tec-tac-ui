#!/usr/bin/env bash
set -euo pipefail
TARGET_ROOT="${TEC_TAC_UI_ROOT:-/var/www/rmm/dist/tec-tac}"
[[ ${EUID} -eq 0 ]] || { echo '[TEC-TAC-UI] ERROR: Run as root.' >&2; exit 1; }
if [[ ! -e "${TARGET_ROOT}" ]]; then
  echo "[TEC-TAC-UI] Nothing installed at ${TARGET_ROOT}."
  exit 0
fi
BACKUP="${TARGET_ROOT}.removed.$(date +%Y%m%dT%H%M%S)"
mv "${TARGET_ROOT}" "${BACKUP}"
echo "[TEC-TAC-UI] Removed UI. Backup: ${BACKUP}"
