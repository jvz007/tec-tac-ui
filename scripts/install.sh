#!/usr/bin/env bash
set -euo pipefail

UI_SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Captured before tec-tac-config.sh runs, so a value in tec-tac.conf cannot silently override one the caller gave.
CALLER_API_URL="${TEC_TAC_API_URL-}"
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
command -v npm >/dev/null 2>&1 || refuse "npm is required to build tec-tac-ui."

# The Tactical API URL for /env-config.js (0.12.113). The UI installer owns the deployed file.
# Sources, in order: (1) the caller's TEC_TAC_API_URL, (2) TEC_TAC_API_URL in tec-tac.conf, (3) the PROD_URL of the env-config.js this
# installer wrote last time (the installed ${TARGET_ROOT}/env-config.js), (4) the PROD_URL in Tactical's own env-config.js. Source 4 is
# read only: only the checked value is used, and Tactical's file is never copied, changed or deployed.
API_URL_RE='^https?://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:[0-9]{1,5})?(/[A-Za-z0-9._~%/+-]*)?$'
# Prints the cleaned URL, or fails when the value is not an absolute http(s) URL made of plain characters.
clean_api_url() {
  local v="${1-}"
  while [[ "${v}" == */ ]]; do v="${v%/}"; done
  [[ -n "${v}" ]] || return 1
  LC_ALL=C bash -c '[[ "$1" =~ $2 ]]' _ "${v}" "${API_URL_RE}" || return 1
  printf '%s' "${v}"
}
# Prints PROD_URL from a file this installer wrote: a regular file, not a link.
read_api_url_file() {
  local f="$1"
  [[ -f "${f}" && ! -L "${f}" && -r "${f}" ]] || return 1
  sed -nE 's/^[[:space:]]*PROD_URL:[[:space:]]*"([^"]*)"[[:space:]]*$/\1/p' "${f}" | head -n1
}
API_URL=""
API_URL_SOURCE=""
if [[ -n "${CALLER_API_URL}" ]]; then
  API_URL="$(clean_api_url "${CALLER_API_URL}")" || refuse "TEC_TAC_API_URL must be a full web address such as https://api.example.com (http or https, no spaces, quotes, query or fragment). Nothing was changed."
  API_URL_SOURCE="TEC_TAC_API_URL"
elif [[ -n "${TEC_TAC_API_URL-}" ]]; then
  API_URL="$(clean_api_url "${TEC_TAC_API_URL}")" || refuse "TEC_TAC_API_URL in ${TEC_TAC_CONFIG_FILE} must be a full web address such as https://api.example.com (http or https, no spaces, quotes, query or fragment). Nothing was changed."
  API_URL_SOURCE="${TEC_TAC_CONFIG_FILE}"
else
  previous="$(read_api_url_file "${TARGET_ROOT}/env-config.js" || true)"
  if [[ -n "${previous}" ]] && API_URL="$(clean_api_url "${previous}")"; then
    API_URL_SOURCE="the installed ${TARGET_ROOT}/env-config.js"
  else
    API_URL=""
  fi
fi
# Last source (Johan, Q72 option b): PROD_URL from Tactical's own env-config.js. Read-only input: only the value is parsed and checked
# the same way as the others. The file is never copied, changed or deployed; the UI always writes its own file from the checked value.
if [[ -z "${API_URL}" ]]; then
  tactical_env="${TACTICAL_FRONTEND_ROOT}/env-config.js"
  if [[ -f "${tactical_env}" && ! -L "${tactical_env}" && -r "${tactical_env}" ]]; then
    tactical_value="$(sed -nE "s/.*PROD_URL[\"']?[[:space:]]*[:=][[:space:]]*[\"']([^\"']+)[\"'].*/\1/p" "${tactical_env}" | head -n1 || true)"
    if [[ -n "${tactical_value}" ]]; then
      API_URL="$(clean_api_url "${tactical_value}")" \
        || refuse "PROD_URL in ${tactical_env} is not a full web address such as https://api.example.com, so it cannot be used. Add TEC_TAC_API_URL=https://<your API host> to ${TEC_TAC_CONFIG_FILE}, or run the installer with TEC_TAC_API_URL set. Nothing was changed."
      API_URL_SOURCE="PROD_URL in Tactical's ${tactical_env} (read only, not copied)"
    fi
  fi
fi
if [[ -z "${API_URL}" ]]; then
  refuse "Set the Tactical API address once and the update can go ahead: add TEC_TAC_API_URL=https://<your API host> to ${TEC_TAC_CONFIG_FILE}, or run the installer with TEC_TAC_API_URL set. Nothing was changed."
fi
log "Tactical API URL for env-config.js: ${API_URL}. Source used: ${API_URL_SOURCE}."
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
# The runtime config goes into the staged tree, so the live replace below carries it. Written atomically; mktemp makes a 0600 file.
if [[ -n "${API_URL}" ]]; then
  ENV_TMP="$(mktemp "${STAGE_ROOT}/.env-config.XXXXXX")"
  js_url="${API_URL//\\/\\\\}"
  js_url="${js_url//\"/\\\"}"
  printf 'window._env_ = {\n  PROD_URL: "%s"\n};\n' "${js_url}" > "${ENV_TMP}"
  chmod 0644 "${ENV_TMP}"
  mv -f "${ENV_TMP}" "${STAGE_ROOT}/env-config.js"
fi
log "Preflighting extension UI modules against staged deployment."
# set -e would exit with the child's own status here, so the refusal is explicit: nothing live has changed yet.
if ! TEC_TAC_UI_ROOT="${STAGE_ROOT}" bash "${UI_SOURCE_ROOT}/scripts/sync-modules.sh"; then
  refuse "The extension UI preflight failed on the staged build. The installed UI was not changed."
fi

# Is this a Tactical-integrated host? Decided before the first live change, so a host that needs the nginx include but has no block to
# put it in is refused here with nothing changed. repair-nginx.sh would only fail after the live swap.
# Standalone = no Tactical nginx block AND no Tactical frontend root. The test mirrors repair-nginx.sh: Tactical's frontend.conf,
# or an enabled block that serves Tactical's dist root.
FRONTEND_NGINX_CONF="${TACTICAL_FRONTEND_NGINX_CONF:-/etc/nginx/sites-available/frontend.conf}"
NGINX_SITES_ENABLED="${TEC_TAC_NGINX_SITES_ENABLED:-/etc/nginx/sites-enabled}"
HAS_TACTICAL_NGINX=0
if [[ -f "${FRONTEND_NGINX_CONF}" ]]; then
  HAS_TACTICAL_NGINX=1
elif grep -RIlq --include='*.conf' -E 'root[[:space:]]+/var/www/rmm/dist[[:space:]]*;' "${NGINX_SITES_ENABLED}" 2>/dev/null; then
  HAS_TACTICAL_NGINX=1
elif [[ -d "${TACTICAL_FRONTEND_ROOT}" ]]; then
  refuse "Tactical's frontend is at ${TACTICAL_FRONTEND_ROOT}, but no Tactical nginx server block was found. Set TACTICAL_FRONTEND_NGINX_CONF to Tactical's frontend.conf, or TEC_TAC_NGINX_SITES_ENABLED to the folder of enabled nginx sites, and run the update again. Nothing was changed."
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

# The deployed file must be the UI's own JavaScript, never index.html. A failure here is after the first live change, so Core rolls back.
if [[ -n "${API_URL}" ]]; then
  DEPLOYED_ENV="${TARGET_ROOT}/env-config.js"
  if [[ ! -f "${DEPLOYED_ENV}" || -L "${DEPLOYED_ENV}" || ! -r "${DEPLOYED_ENV}" ]]; then
    fail "The deployed ${DEPLOYED_ENV} is missing or is not a readable file."
  fi
  if ! grep -q 'window\._env_' "${DEPLOYED_ENV}" || grep -q '<' "${DEPLOYED_ENV}"; then
    fail "The deployed ${DEPLOYED_ENV} is not valid runtime configuration."
  fi
  if [[ "$(read_api_url_file "${DEPLOYED_ENV}" || true)" != "${API_URL}" ]]; then
    fail "The deployed ${DEPLOYED_ENV} does not carry PROD_URL ${API_URL}."
  fi
fi

# Install/repair only the small nginx integration. The built UI itself is now
# outside Tactical's /var/www/rmm/dist tree and therefore survives upgrades.
# A standalone host has no Tactical frontend server block, so there is nothing to add the include to: skip repair-nginx.sh there.
# HAS_TACTICAL_NGINX was decided before the first live change (see above).
if [[ "${HAS_TACTICAL_NGINX}" -eq 1 ]]; then
  TEC_TAC_UI_ROOT="${TARGET_ROOT}" TEC_TAC_UI_DEPLOY_BASE="${DEPLOY_BASE}" \
    bash "${UI_SOURCE_ROOT}/scripts/repair-nginx.sh"
else
  log "No Tactical frontend nginx server block found (standalone host): the nginx include was not added. Serve ${TARGET_ROOT} from your own web server."
fi

log "Installed tec-tac-ui at ${TARGET_ROOT}."
log "The deployment is independent of Tactical's replaceable frontend dist tree."
log "Check the runtime file: curl -ksS https://<host>/env-config.js must show PROD_URL, not the index page. On a Tactical-hosted server that is Tactical's own file."
log "Open https://<tactical-frontend>/tec-tac/."
