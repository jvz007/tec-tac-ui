#!/usr/bin/env bash
set -euo pipefail

UI_SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${UI_SOURCE_ROOT}/scripts/tec-tac-config.sh"
DEPLOY_BASE="${TEC_TAC_UI_DEPLOY_BASE}"
TARGET_ROOT="${TEC_TAC_UI_ROOT:-${TEC_TAC_UI_DEPLOY_ROOT}}"
TACTICAL_FRONTEND_ROOT="${TACTICAL_FRONTEND_ROOT:-/var/www/rmm/dist}"

log() { printf '[TEC-TAC-UI] %s\n' "$*"; }
fail() { printf '[TEC-TAC-UI] ERROR: %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || fail "Run as root."
[[ -f "${TACTICAL_FRONTEND_ROOT}/env-config.js" ]] || fail "Tactical frontend env-config.js not found under ${TACTICAL_FRONTEND_ROOT}."
command -v npm >/dev/null 2>&1 || fail "npm is required to build tec-tac-ui."

log "Building tec-tac-ui $(cat "${UI_SOURCE_ROOT}/VERSION")."
cd "${UI_SOURCE_ROOT}"
npm install --no-package-lock
npm run build

[[ -f "${UI_SOURCE_ROOT}/dist/index.html" ]] || fail "Vite build did not create dist/index.html."

# Assemble and validate the complete UI tree before touching the live deployment.
# This catches malformed extension UI manifests/entries without turning an
# otherwise healthy Tec-Tac UI update into a failed live replacement/rollback.
STAGE_ROOT="$(mktemp -d /tmp/tec-tac-ui-stage.XXXXXX)"
cleanup_stage() { rm -rf "${STAGE_ROOT}"; }
trap cleanup_stage EXIT
cp -a "${UI_SOURCE_ROOT}/dist/." "${STAGE_ROOT}/"
cp -a "${UI_SOURCE_ROOT}/VERSION" "${STAGE_ROOT}/VERSION"
cp -a "${UI_SOURCE_ROOT}/package.json" "${STAGE_ROOT}/package.json"
log "Preflighting extension UI modules against staged deployment."
TEC_TAC_UI_ROOT="${STAGE_ROOT}" bash "${UI_SOURCE_ROOT}/scripts/sync-modules.sh"

mkdir -p "${DEPLOY_BASE}"
BACKUP=""
if [[ -d "${TARGET_ROOT}" ]]; then
  BACKUP="${TARGET_ROOT}.backup.$(date +%Y%m%dT%H%M%S)"
  cp -a "${TARGET_ROOT}" "${BACKUP}"
  log "Backed up existing UI to ${BACKUP}."
fi

rm -rf "${TARGET_ROOT}"
mkdir -p "${TARGET_ROOT}"
cp -a "${STAGE_ROOT}/." "${TARGET_ROOT}/"
chown -R www-data:www-data "${DEPLOY_BASE}" 2>/dev/null || true
cleanup_stage
trap - EXIT

# Install/repair only the small nginx integration. The built UI itself is now
# outside Tactical's /var/www/rmm/dist tree and therefore survives upgrades.
TEC_TAC_UI_ROOT="${TARGET_ROOT}" TEC_TAC_UI_DEPLOY_BASE="${DEPLOY_BASE}" \
  bash "${UI_SOURCE_ROOT}/scripts/repair-nginx.sh"

log "Installed tec-tac-ui at ${TARGET_ROOT}."
log "The deployment is independent of Tactical's replaceable frontend dist tree."
log "Open https://<tactical-frontend>/tec-tac/."
