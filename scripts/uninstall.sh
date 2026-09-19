#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${HERE}/tec-tac-config.sh"
DEPLOY_BASE="${TEC_TAC_UI_DEPLOY_BASE}"
TARGET_ROOT="${TEC_TAC_UI_ROOT:-${TEC_TAC_UI_DEPLOY_ROOT}}"
FRONTEND_CONF="${TACTICAL_FRONTEND_NGINX_CONF:-/etc/nginx/sites-available/frontend.conf}"
SNIPPET_FILE="${TEC_TAC_NGINX_SNIPPET_DIR:-/etc/nginx/snippets}/tec-tac.conf"
[[ ${EUID} -eq 0 ]] || { echo '[TEC-TAC-UI] ERROR: Run as root.' >&2; exit 1; }

if [[ -e "${TARGET_ROOT}" ]]; then
  BACKUP="${TARGET_ROOT}.removed.$(date +%Y%m%dT%H%M%S)"
  mv "${TARGET_ROOT}" "${BACKUP}"
  echo "[TEC-TAC-UI] Removed UI. Backup: ${BACKUP}"
else
  echo "[TEC-TAC-UI] No UI deployment found at ${TARGET_ROOT}."
fi

if [[ -f "${FRONTEND_CONF}" ]]; then
  python3 - "${FRONTEND_CONF}" "${SNIPPET_FILE}" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1]); snippet=sys.argv[2]
lines=p.read_text(encoding='utf-8').splitlines(True)
needle=f'include {snippet};'
new=[line for line in lines if needle not in line]
if new != lines:
    p.write_text(''.join(new),encoding='utf-8')
PY
fi
rm -f "${SNIPPET_FILE}"
if command -v nginx >/dev/null 2>&1 && nginx -t >/dev/null 2>&1; then
  systemctl reload nginx || true
fi
