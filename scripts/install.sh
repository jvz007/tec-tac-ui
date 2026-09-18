#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ROOT="${TEC_TAC_UI_ROOT:-/var/www/rmm/dist/tec-tac}"
TACTICAL_FRONTEND_ROOT="${TACTICAL_FRONTEND_ROOT:-/var/www/rmm/dist}"

log() { printf '[TEC-TAC-UI] %s\n' "$*"; }
fail() { printf '[TEC-TAC-UI] ERROR: %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || fail "Run as root."
[[ -f "${TACTICAL_FRONTEND_ROOT}/env-config.js" ]] || fail "Tactical frontend env-config.js not found under ${TACTICAL_FRONTEND_ROOT}."
command -v npm >/dev/null 2>&1 || fail "npm is required to build tec-tac-ui."

log "Building tec-tac-ui $(cat "${REPO_ROOT}/VERSION")."
cd "${REPO_ROOT}"
npm install
npm run build

[[ -f "${REPO_ROOT}/dist/index.html" ]] || fail "Vite build did not create dist/index.html."

BACKUP=""
if [[ -d "${TARGET_ROOT}" ]]; then
  BACKUP="${TARGET_ROOT}.backup.$(date +%Y%m%dT%H%M%S)"
  cp -a "${TARGET_ROOT}" "${BACKUP}"
  log "Backed up existing UI to ${BACKUP}."
fi

rm -rf "${TARGET_ROOT}"
mkdir -p "${TARGET_ROOT}"
cp -a "${REPO_ROOT}/dist/." "${TARGET_ROOT}/"
chown -R www-data:www-data "${TARGET_ROOT}" 2>/dev/null || true

# Sync optional extension UI modules without changing the backend repository.
TEC_TAC_UI_ROOT="${TARGET_ROOT}" bash "${REPO_ROOT}/scripts/sync-modules.sh"

log "Installed tec-tac-ui at ${TARGET_ROOT}."
log "Open https://<tactical-frontend>/tec-tac/ while signed into Tactical."
