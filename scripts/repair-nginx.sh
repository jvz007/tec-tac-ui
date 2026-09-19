#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${HERE}/tec-tac-config.sh"
DEPLOY_BASE="${TEC_TAC_UI_DEPLOY_BASE}"
UI_ROOT="${TEC_TAC_UI_ROOT:-${TEC_TAC_UI_DEPLOY_ROOT}}"
FRONTEND_CONF="${TACTICAL_FRONTEND_NGINX_CONF:-/etc/nginx/sites-available/frontend.conf}"
SNIPPET_DIR="${TEC_TAC_NGINX_SNIPPET_DIR:-/etc/nginx/snippets}"
SNIPPET_FILE="${SNIPPET_DIR}/tec-tac.conf"
INCLUDE_LINE="    include ${SNIPPET_FILE};"

log() { printf '[TEC-TAC-UI] %s\n' "$*"; }
fail() { printf '[TEC-TAC-UI] ERROR: %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || fail "Run as root."
[[ -f "${UI_ROOT}/index.html" ]] || fail "Tec-Tac UI is not deployed at ${UI_ROOT}."
command -v nginx >/dev/null 2>&1 || fail "nginx is not installed."

# Tactical currently creates /etc/nginx/sites-available/frontend.conf. If a
# future version moves it, locate the enabled server that serves its dist root.
if [[ ! -f "${FRONTEND_CONF}" ]]; then
  candidate="$(grep -RIl --include='*.conf' -E 'root[[:space:]]+/var/www/rmm/dist[[:space:]]*;' /etc/nginx/sites-enabled 2>/dev/null | head -n1 || true)"
  [[ -n "${candidate}" ]] || fail "Could not locate Tactical frontend nginx server block. Set TACTICAL_FRONTEND_NGINX_CONF explicitly."
  FRONTEND_CONF="$(readlink -f "${candidate}")"
fi

mkdir -p "${SNIPPET_DIR}"
cat > "${SNIPPET_FILE}" <<EOF_SNIPPET
# Managed by Tec-Tac UI. Safe to recreate after a Tactical RMM update.
location = /tec-tac {
    return 301 /tec-tac/;
}

location ^~ /tec-tac/ {
    root ${DEPLOY_BASE};
    try_files \$uri \$uri/ /tec-tac/index.html;
}
EOF_SNIPPET
chown root:root "${SNIPPET_FILE}"
chmod 0644 "${SNIPPET_FILE}"

BACKUP="${FRONTEND_CONF}.tec-tac.$(date +%Y%m%dT%H%M%S).bak"
cp -a "${FRONTEND_CONF}" "${BACKUP}"

python3 - "${FRONTEND_CONF}" "${SNIPPET_FILE}" <<'PY'
import re
import sys
from pathlib import Path

conf = Path(sys.argv[1])
snippet = sys.argv[2]
text = conf.read_text(encoding='utf-8')
include_stmt = f'include {snippet};'

if include_stmt in text:
    print('[TEC-TAC-UI] nginx include already present.')
    raise SystemExit(0)

lines = text.splitlines(keepends=True)
server_starts = []
depth = 0
start = None

for idx, line in enumerate(lines):
    cleaned = re.sub(r'#.*$', '', line)
    opens = cleaned.count('{')
    closes = cleaned.count('}')
    if start is None and re.search(r'\bserver\s*\{', cleaned):
        start = idx
        depth = opens - closes
        continue
    if start is not None:
        depth += opens - closes
        if depth == 0:
            server_starts.append((start, idx))
            start = None

chosen = None
for a, b in server_starts:
    block = ''.join(lines[a:b+1])
    if re.search(r'root\s+/var/www/rmm/dist\s*;', block):
        chosen = (a, b)
        break

if chosen is None:
    raise SystemExit('[TEC-TAC-UI] ERROR: Tactical frontend server block with root /var/www/rmm/dist was not found.')

a, b = chosen
indent_match = re.match(r'(\s*)', lines[b])
base_indent = indent_match.group(1) if indent_match else ''
lines.insert(b, f'{base_indent}    {include_stmt}\n')
conf.write_text(''.join(lines), encoding='utf-8')
print(f'[TEC-TAC-UI] Added Tec-Tac include to {conf}.')
PY

if ! nginx -t; then
  cp -a "${BACKUP}" "${FRONTEND_CONF}"
  rm -f "${SNIPPET_FILE}"
  fail "nginx validation failed; restored ${FRONTEND_CONF} from ${BACKUP}."
fi

systemctl reload nginx
log "nginx integration OK: ${FRONTEND_CONF} -> ${SNIPPET_FILE}"
log "Persistent UI root: ${UI_ROOT}"
