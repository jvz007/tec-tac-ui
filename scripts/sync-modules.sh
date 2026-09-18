#!/usr/bin/env bash
set -euo pipefail
EXTENSIONS_ROOT="${TEC_TAC_EXTENSIONS_ROOT:-/opt/tec-tac/extensions}"
UI_ROOT="${TEC_TAC_UI_ROOT:-/var/lib/tec-tac/ui/tec-tac}"
MODULES_ROOT="${UI_ROOT}/modules"
STATE_FILE="${TEC_TAC_MODULE_STATE:-/var/lib/tec-tac/module-manager/module-state.json}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
log(){ printf '[TEC-TAC-UI] %s\n' "$*"; }
fail(){ printf '[TEC-TAC-UI] ERROR: %s\n' "$*" >&2; exit 1; }
[[ ${EUID} -eq 0 ]] || fail "Run as root."
[[ -d "${UI_ROOT}" ]] || fail "UI deployment not found: ${UI_ROOT}"
mkdir -p "${MODULES_ROOT}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; mkdir -p "${TMP}/modules"
"${PYTHON_BIN}" - "${EXTENSIONS_ROOT}" "${TMP}/modules" "${STATE_FILE}" <<'PY'
import json, shutil, sys
from pathlib import Path
extensions_root, out_root, state_file = map(Path, sys.argv[1:])
out_root.mkdir(parents=True, exist_ok=True)
state={"modules":{}}
if state_file.is_file():
    state=json.loads(state_file.read_text(encoding="utf-8"))
def module_record(mid): return state.get("modules",{}).get(mid) or {}
def enabled(mid): return bool(module_record(mid).get("enabled", True))
def package_default_visible(payload):
    if isinstance(payload.get("visible"), bool): return payload["visible"]
    nav=payload.get("navigation")
    if isinstance(nav,dict) and isinstance(nav.get("visible"), bool): return nav["visible"]
    return True
def visible(mid,payload):
    record=module_record(mid)
    return bool(record["visible"]) if "visible" in record else package_default_visible(payload)
modules=[]
if extensions_root.is_dir():
  for extension in sorted(p for p in extensions_root.iterdir() if p.is_dir()):
    manifest=extension/"tec_tac_ui.json"
    if not manifest.is_file(): continue
    payload=json.loads(manifest.read_text(encoding="utf-8")); mid=str(payload.get("id","")).strip()
    if not mid or mid != extension.name: raise SystemExit(f"invalid UI module id in {manifest}")
    if not enabled(mid):
      print(f"module={mid} disabled=yes")
      continue
    entry=str(payload.get("entry","")).strip(); public=payload.get("public")
    if public is not None and not isinstance(public,dict): raise SystemExit(f"public must be an object in {manifest}")
    public_entry=str((public or {}).get("entry","")).strip(); expected=f"/public/{mid}"
    public_base=str((public or {}).get("base_path",expected)).strip() if public else ""
    if public and not public_entry: raise SystemExit(f"public.entry is required in {manifest}")
    if public_entry and public_base != expected: raise SystemExit(f"public base_path must be exactly {expected} in {manifest}")
    if not entry and not public_entry: raise SystemExit(f"UI module must declare entry, public.entry, or both in {manifest}")
    ext_manifest=extension/"tec_tac.json"; ext_payload=json.loads(ext_manifest.read_text(encoding="utf-8"))
    declared={code for values in (ext_payload.get("permission_groups") or {}).values() for code in values}
    ui_permissions=payload.get("permissions") or []
    unknown=sorted(set(ui_permissions)-declared)
    if unknown: raise SystemExit(f"UI module {mid} references undeclared permissions: {', '.join(unknown)}")
    def resolve(value,label):
      if not value: return None
      path=(extension/value).resolve(); path.relative_to(extension.resolve())
      if not path.is_file(): raise SystemExit(f"{label} not found: {path}")
      return path
    src=resolve(entry,"UI entry"); pub=resolve(public_entry,"Public UI entry")
    if src and pub and src.parent != pub.parent: raise SystemExit(f"authenticated/public entries must share a bundle directory in {manifest}")
    bundle=(src or pub).parent; dst=out_root/mid; shutil.copytree(bundle,dst)
    effective_visible=visible(mid,payload)
    navigation=payload.get("navigation") or {"label":mid,"section":"Extensions","icon":"◇"}
    if not isinstance(navigation,dict): raise SystemExit(f"navigation must be an object in {manifest}")
    navigation=dict(navigation); navigation["visible"]=effective_visible
    modules.append({"id":mid,"version":str(payload.get("version","0.0.0")),"visible":effective_visible,"entry":f"/tec-tac/modules/{mid}/{src.name}" if src else None,"public":{"entry":f"/tec-tac/modules/{mid}/{pub.name}","base_path":public_base} if pub else None,"navigation":navigation,"permissions":ui_permissions})
(out_root/"modules.json").write_text(json.dumps(modules,indent=2)+"\n",encoding="utf-8")
print(f"discovered={len(modules)}")
PY
rm -rf "${MODULES_ROOT}"; mkdir -p "${MODULES_ROOT}"; cp -a "${TMP}/modules/." "${MODULES_ROOT}/"
chown -R www-data:www-data "${MODULES_ROOT}" 2>/dev/null || true
log "UI modules synchronized with runtime-state and navigation-visibility metadata."
