#!/usr/bin/env bash
# Content-Security-Policy for the Tec-Tac UI, written into the nginx snippet by
# repair-nginx.sh. Source this file; it only defines functions.
#
# What the policy does: it stops injected inline scripts and scripts loaded from
# other sites. What it does not do: module scripts are same-origin, so they can
# still read localStorage. A CSP is not a wall between modules and the token.
#
# The Tactical API sits on a different origin from the UI (for example
# api.tcrm.example.com), so connect-src 'self' alone would break every call. The
# API origin comes from PROD_URL in Tactical's env-config.js.

# Bracket expressions put ']' first so IPv6 hosts like [::1] are accepted.
_TEC_TAC_CSP_URL_RE='^https?://[]A-Za-z0-9._:@[-]+(/[A-Za-z0-9._~/%-]*)?$'
_TEC_TAC_CSP_ORIGIN_RE='^(https?)://([]A-Za-z0-9._:@[-]+)(/.*)?$'

_tec_tac_csp_warn() { printf '[TEC-TAC-UI] CSP: %s\n' "$*" >&2; }

# Print PROD_URL from an env-config.js file. Fails (prints nothing) when the file
# cannot be read, has no PROD_URL, or the value is not an http(s) URL made of
# safe characters. The value ends up inside an nginx config, so it is checked.
tec_tac_csp_read_prod_url() {
  local file="${1:-}" value
  [[ -n "${file}" && -r "${file}" ]] || return 1
  value="$(sed -nE "s/.*PROD_URL[\"']?[[:space:]]*[:=][[:space:]]*[\"']([^\"']*)[\"'].*/\\1/p" "${file}" | head -n1 | tr -d '[:space:]')"
  [[ "${value}" =~ ${_TEC_TAC_CSP_URL_RE} ]] || return 1
  printf '%s\n' "${value}"
}

# Reduce a URL to scheme://host[:port]. Prints nothing for anything that is not http(s).
tec_tac_csp_origin() {
  local url="${1:-}"
  [[ "${url}" =~ ${_TEC_TAC_CSP_ORIGIN_RE} ]] || return 1
  local scheme="${BASH_REMATCH[1]}" authority="${BASH_REMATCH[2]}"
  authority="${authority##*@}"
  [[ -n "${authority}" ]] || return 1
  printf '%s://%s\n' "${scheme}" "${authority}"
}

# https://host -> wss://host, http://host -> ws://host.
tec_tac_csp_websocket_origin() {
  local origin="${1:-}"
  case "${origin}" in
    https://*) printf 'wss://%s\n' "${origin#https://}" ;;
    http://*) printf 'ws://%s\n' "${origin#http://}" ;;
    *) return 1 ;;
  esac
}

# Keep only source tokens made of safe characters. This keeps quotes,
# semicolons and keywords such as 'unsafe-inline' out of the policy.
_tec_tac_csp_clean_sources() {
  local token out=() tokens=()
  read -ra tokens <<< "${1:-}"
  for token in "${tokens[@]}"; do
    if [[ "${token}" =~ ^[A-Za-z0-9*.:/_-]+$ ]]; then
      out+=("${token}")
    else
      _tec_tac_csp_warn "ignored an extra source that is not a plain host or scheme: ${token}"
    fi
  done
  printf '%s' "${out[*]:-}"
}

# Build the policy for an API origin. Optional widening comes from
# TEC_TAC_CSP_CONNECT_EXTRA, TEC_TAC_CSP_FRAME_EXTRA and TEC_TAC_CSP_IMG_EXTRA
# (space separated, set in tec-tac.conf).
#
# - script-src 'self': no inline script, no eval.
# - style-src 'unsafe-inline': Vue and Monaco inject styles at run time.
# - worker-src blob:: Monaco workers.
# - frame-src https:: Take Control and Remote Background embed MeshCentral, and
#   nginx cannot know that host.
# - No form-action: the SSO handshake posts a form to the API origin, which then
#   redirects to the identity provider. form-action would block that redirect.
tec_tac_csp_policy() {
  local api_origin="${1:-}" ws_origin connect img frame
  [[ -n "${api_origin}" ]] || return 1
  ws_origin="$(tec_tac_csp_websocket_origin "${api_origin}")" || return 1
  connect="'self' ${api_origin} ${ws_origin}"
  img="'self' data: blob: ${api_origin}"
  frame="'self' blob: https:"
  local extra
  extra="$(_tec_tac_csp_clean_sources "${TEC_TAC_CSP_CONNECT_EXTRA:-}")"; [[ -n "${extra}" ]] && connect+=" ${extra}"
  extra="$(_tec_tac_csp_clean_sources "${TEC_TAC_CSP_IMG_EXTRA:-}")"; [[ -n "${extra}" ]] && img+=" ${extra}"
  extra="$(_tec_tac_csp_clean_sources "${TEC_TAC_CSP_FRAME_EXTRA:-}")"; [[ -n "${extra}" ]] && frame+=" ${extra}"
  printf "%s" "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src ${img}; font-src 'self' data:; worker-src 'self' blob:; connect-src ${connect}; frame-src ${frame}; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
}

# The header name for a mode: enforce, report-only. Prints nothing for off.
tec_tac_csp_header_name() {
  case "${1:-enforce}" in
    enforce) printf 'Content-Security-Policy\n' ;;
    report-only) printf 'Content-Security-Policy-Report-Only\n' ;;
    *) return 1 ;;
  esac
}

# One nginx directive for a mode and API origin, or nothing (mode off, unknown
# API origin). An unknown mode falls back to enforce, with a warning.
tec_tac_csp_nginx_line() {
  local mode="${1:-enforce}" api_origin="${2:-}" name policy
  case "${mode}" in
    off) return 0 ;;
    enforce|report-only) ;;
    *) _tec_tac_csp_warn "TEC_TAC_CSP_MODE '${mode}' is not enforce, report-only or off; using enforce."; mode=enforce ;;
  esac
  [[ -n "${api_origin}" ]] || return 0
  name="$(tec_tac_csp_header_name "${mode}")" || return 0
  policy="$(tec_tac_csp_policy "${api_origin}")" || return 0
  printf 'add_header %s "%s" always;\n' "${name}" "${policy}"
}

# The whole step for repair-nginx.sh: read PROD_URL from env-config.js and print
# the directive. When the API origin cannot be read it warns and prints nothing,
# because a policy built without it would break every API call.
tec_tac_csp_from_env_config() {
  local mode="${1:-enforce}" env_config="${2:-}" url origin
  if [[ "${mode}" == "off" ]]; then
    _tec_tac_csp_warn "TEC_TAC_CSP_MODE=off; no Content-Security-Policy written."
    return 0
  fi
  if ! url="$(tec_tac_csp_read_prod_url "${env_config}")"; then
    _tec_tac_csp_warn "could not read an http(s) PROD_URL from ${env_config}; no Content-Security-Policy written."
    return 0
  fi
  origin="$(tec_tac_csp_origin "${url}")" || { _tec_tac_csp_warn "PROD_URL is not an http(s) URL; no Content-Security-Policy written."; return 0; }
  tec_tac_csp_nginx_line "${mode}" "${origin}"
}
