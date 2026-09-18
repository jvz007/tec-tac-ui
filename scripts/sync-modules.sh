#!/usr/bin/env bash
set -euo pipefail

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
        public = payload.get("public")
        if public is not None and not isinstance(public, dict):
            raise SystemExit(f"public must be an object in {manifest}")
        public_entry = str((public or {}).get("entry", "")).strip()
        expected_public_base = f"/public/{module_id}"
        public_base = str((public or {}).get("base_path", expected_public_base)).strip() if public else ""

        if not module_id or module_id != extension.name:
            raise SystemExit(f"invalid UI module id in {manifest}")
        if public and not public_entry:
            raise SystemExit(f"public.entry is required in {manifest}")
        if public_entry and public_base != expected_public_base:
            raise SystemExit(f"public base_path must be exactly {expected_public_base} in {manifest}")
        if not entry and not public_entry:
            raise SystemExit(f"UI module must declare entry, public.entry, or both in {manifest}")

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

        def resolve_entry(value, label):
            if not value:
                return None
            resolved = (extension / value).resolve()
            try:
                resolved.relative_to(extension.resolve())
            except ValueError:
                raise SystemExit(f"{label} escapes extension root: {manifest}")
            if not resolved.is_file():
                raise SystemExit(f"{label} not found: {resolved}")
            return resolved

        src_entry = resolve_entry(entry, "UI entry")
        src_public_entry = resolve_entry(public_entry, "Public UI entry")
        if src_entry and src_public_entry and src_entry.parent != src_public_entry.parent:
            raise SystemExit(f"authenticated and public UI entries must share one bundle directory in {manifest}")

        bundle_entry = src_entry or src_public_entry
        src_ui = bundle_entry.parent
        dst = out_root / module_id
        shutil.copytree(src_ui, dst)

        auth_url = f"/tec-tac/modules/{module_id}/{src_entry.name}" if src_entry else None
        public_payload = None
        if src_public_entry:
            public_payload = {
                "entry": f"/tec-tac/modules/{module_id}/{src_public_entry.name}",
                "base_path": public_base,
            }

        modules.append({
            "id": module_id,
            "version": str(payload.get("version", "0.0.0")),
            "entry": auth_url,
            "public": public_payload,
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
    print(
        f"module={module['id']} version={module['version']} "
        f"auth={'yes' if module['entry'] else 'no'} public={'yes' if module['public'] else 'no'}"
    )
PY

rm -rf "${MODULES_ROOT}"
mkdir -p "${MODULES_ROOT}"
cp -a "${TMP}/modules/." "${MODULES_ROOT}/"
chown -R www-data:www-data "${MODULES_ROOT}" 2>/dev/null || true
log "UI modules synchronized from ${EXTENSIONS_ROOT}."
