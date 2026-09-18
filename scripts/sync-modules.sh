#!/usr/bin/env bash
set -euo pipefail

# Sync trusted Tec-Tac UI modules from an installed backend extension tree into
# the deployed Tec-Tac UI directory. This script only reads the backend repo.

EXTENSIONS_ROOT="${TEC_TAC_EXTENSIONS_ROOT:-/opt/tec-tac/extensions}"
UI_ROOT="${TEC_TAC_UI_ROOT:-/var/www/rmm/dist/tec-tac}"
MODULES_ROOT="${UI_ROOT}/modules"
PYTHON_BIN="${PYTHON_BIN:-python3}"

log() { printf '[TEC-TAC-UI] %s\n' "$*"; }
fail() { printf '[TEC-TAC-UI] ERROR: %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || fail "Run as root."
[[ -d "${UI_ROOT}" ]] || fail "UI deployment not found: ${UI_ROOT}"
mkdir -p "${MODULES_ROOT}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "${TMP}/modules"

"${PYTHON_BIN}" - "${EXTENSIONS_ROOT}" "${TMP}/modules" <<'PY'
import json
import shutil
import sys
from pathlib import Path

extensions_root = Path(sys.argv[1])
out_root = Path(sys.argv[2])
out_root.mkdir(parents=True, exist_ok=True)
modules = []

if extensions_root.is_dir():
    for extension in sorted(p for p in extensions_root.iterdir() if p.is_dir()):
        manifest = extension / "tec_tac_ui.json"
        if not manifest.is_file():
            continue
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        module_id = str(payload.get("id", "")).strip()
        entry = str(payload.get("entry", "")).strip()
        if not module_id or module_id != extension.name:
            raise SystemExit(f"invalid UI module id in {manifest}")

        extension_manifest = extension / "tec_tac.json"
        if not extension_manifest.is_file():
            raise SystemExit(f"missing extension manifest for UI module: {extension_manifest}")
        extension_payload = json.loads(extension_manifest.read_text(encoding="utf-8"))
        if str(extension_payload.get("id", "")).strip() != module_id:
            raise SystemExit(f"extension/UI manifest id mismatch in {extension}")
        declared_permissions = {
            code
            for values in (extension_payload.get("permission_groups") or {}).values()
            for code in values
        }
        ui_permissions = payload.get("permissions") or []
        if not isinstance(ui_permissions, list):
            raise SystemExit(f"UI permissions must be an array in {manifest}")
        unknown_permissions = sorted(set(ui_permissions) - declared_permissions)
        if unknown_permissions:
            raise SystemExit(
                f"UI module {module_id} references undeclared extension permissions: "
                + ", ".join(unknown_permissions)
            )

        if not entry:
            raise SystemExit(f"missing entry in {manifest}")
        src_entry = (extension / entry).resolve()
        try:
            src_entry.relative_to(extension.resolve())
        except ValueError:
            raise SystemExit(f"UI entry escapes extension root: {manifest}")
        if not src_entry.is_file():
            raise SystemExit(f"UI entry not found: {src_entry}")

        src_ui = src_entry.parent
        dst = out_root / module_id
        shutil.copytree(src_ui, dst)

        public_entry = f"/tec-tac/modules/{module_id}/{src_entry.name}"
        modules.append({
            "id": module_id,
            "version": str(payload.get("version", "0.0.0")),
            "entry": public_entry,
            "navigation": payload.get("navigation") or {
                "label": module_id,
                "section": "Extensions",
                "icon": "◇",
            },
            "permissions": ui_permissions,
        })

(out_root / "modules.json").write_text(json.dumps(modules, indent=2) + "\n", encoding="utf-8")
print(f"discovered={len(modules)}")
for module in modules:
    print(f"module={module['id']} version={module['version']} entry={module['entry']}")
PY

rm -rf "${MODULES_ROOT}"
mkdir -p "${MODULES_ROOT}"
cp -a "${TMP}/modules/." "${MODULES_ROOT}/"
chown -R www-data:www-data "${MODULES_ROOT}" 2>/dev/null || true
log "UI modules synchronized from ${EXTENSIONS_ROOT}."
