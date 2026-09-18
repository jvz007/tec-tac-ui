#!/usr/bin/env bash
set -euo pipefail
TARGET="${TEC_TAC_UI_REPO_ROOT:-/opt/tec-tac-ui}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash apply.sh" >&2; exit 1; }
[[ -f "$TARGET/VERSION" && -f "$TARGET/package.json" && -f "$TARGET/scripts/install.sh" ]] || { echo "Tec-Tac UI repo not found at $TARGET" >&2; exit 1; }
FW="${TEC_TAC_FRAMEWORK_ROOT:-/opt/tec-tac}/VERSION"
[[ -f "$FW" ]] || { echo "Tec-Tac framework VERSION not found" >&2; exit 1; }
FWV="$(tr -d '[:space:]' < "$FW")"
case "$FWV" in 1.4.*|1.5.*|1.6.*|1.7.*|1.8.*|1.9.*) ;; *) echo "UI 0.4.0 requires framework >=1.4.0,<2.0.0; found $FWV" >&2; exit 1;; esac
CURRENT="$(tr -d '[:space:]' < "$TARGET/VERSION")"
case "$CURRENT" in 0.3.*|0.4.0) ;; *) echo "Expected UI 0.3.x or 0.4.0; found $CURRENT" >&2; exit 1;; esac
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/tec-tac/patch-backups/ui-${CURRENT}-${STAMP}"
mkdir -p "$BACKUP/src/views" "$BACKUP/src" "$BACKUP/scripts"
for f in src/modules.js src/views/ModulesView.vue scripts/sync-modules.sh package.json VERSION; do
  [[ -f "$TARGET/$f" ]] && { mkdir -p "$BACKUP/$(dirname "$f")"; cp -a "$TARGET/$f" "$BACKUP/$f"; } || true
done
cp -a "$HERE/src/." "$TARGET/src/"
cp -a "$HERE/scripts/sync-modules.sh" "$TARGET/scripts/sync-modules.sh"
printf '0.4.0\n' > "$TARGET/VERSION"
python3 - "$TARGET/package.json" <<'PY'
import json,sys
p=sys.argv[1]
data=json.load(open(p,encoding='utf-8'))
data['version']='0.4.0'
open(p,'w',encoding='utf-8').write(json.dumps(data,indent=2)+'\n')
PY
bash "$TARGET/scripts/install.sh"
echo "Tec-Tac UI 0.4.0 patch applied. Backup: $BACKUP"
