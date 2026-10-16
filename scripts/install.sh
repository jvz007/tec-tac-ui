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
# A refusal before the first change to the live deployment. Exit status 78 tells Core's update helper that nothing changed,
# so it keeps the installed version and runs no rollback. Never call refuse() after "mkdir -p DEPLOY_BASE": the helper reads
# any 78 as "nothing changed". Everything after the first live change keeps fail() and exit 1.
refuse() {
  printf '[TEC-TAC-UI] ERROR: %s\n' "$*" >&2
  printf '[TEC-TAC-INSTALL] REFUSED: %s\n' "$*" >&2
  exit 78
}
# Any other failing command (npm ci, the build, and everything after the backup) ends with status 1, never with the child's own
# status: a child that happened to end with 78 must not read as a refusal. refuse() above is the only place that uses 78.
on_error() { printf '[TEC-TAC-UI] ERROR: a command failed at line %s.\n' "$1" >&2; exit 1; }
trap 'on_error "${LINENO}"' ERR
set -o errtrace

[[ ${EUID} -eq 0 ]] || fail "Run as root."
[[ -f "${TACTICAL_FRONTEND_ROOT}/env-config.js" ]] || refuse "Tactical frontend env-config.js not found under ${TACTICAL_FRONTEND_ROOT}."
command -v npm >/dev/null 2>&1 || refuse "npm is required to build tec-tac-ui."

log "Building tec-tac-ui $(cat "${UI_SOURCE_ROOT}/VERSION")."
cd "${UI_SOURCE_ROOT}"
npm ci
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
# set -e would exit with the child's own status here, so the refusal is explicit: nothing live has changed yet.
if ! TEC_TAC_UI_ROOT="${STAGE_ROOT}" bash "${UI_SOURCE_ROOT}/scripts/sync-modules.sh"; then
  refuse "The extension UI preflight failed on the staged build. The installed UI was not changed."
fi

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
