#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "account-security-policy-ui: FAIL: $*" >&2; exit 1; }
ACCESS="${ROOT}/src/access.js"
VIEW="${ROOT}/src/views/AccessView.vue"
PANEL="${ROOT}/src/components/access/AccountSecurityPanel.vue"
[[ -f "$PANEL" ]] || fail "account security panel missing"
grep -q 'getAccountSecurityPolicy' "$ACCESS" || fail "policy GET helper missing"
grep -q 'updateAccountSecurityPolicy' "$ACCESS" || fail "policy PUT helper missing"
grep -q '/api/tfd/access/security-policy/' "$ACCESS" || fail "policy endpoint missing"
grep -q 'AccountSecurityPanel' "$VIEW" || fail "Access view does not register account security panel"
grep -q "id:'account-security'" "$VIEW" || fail "Account protection tab missing"
grep -q 'registerUnsaved' "$PANEL" || fail "unsaved policy guard missing"
grep -q 'watch(dirty' "$PANEL" || fail "dirty watcher missing"
grep -q 'persistAccountSecurityPolicy' "$PANEL" || fail "policy save helper missing"
node "${ROOT}/tests/account-security-policy-save-flow.mjs"
grep -q "registerUnsaved(unsavedId, 'Superuser account protection policy', { save: savePolicy, discard: loadPolicy })" "$PANEL" || fail "unsaved save/discard handlers missing"
grep -q 'clearUnsaved(unsavedId)' "$PANEL" || fail "unsaved state is not cleared"
! grep -q 'unregisterUnsaved' "$PANEL" || fail "non-existent unregisterUnsaved export still referenced"
node --input-type=module - "$PANEL" "${ROOT}/src/unsaved.js" <<'NODE'
import fs from 'node:fs'
const [panelPath, unsavedPath] = process.argv.slice(2)
const panel = fs.readFileSync(panelPath, 'utf8')
const unsaved = fs.readFileSync(unsavedPath, 'utf8')
const match = panel.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/\.\.\/unsaved['"]/)
if (!match) throw new Error('named ../../unsaved import missing')
const imported = match[1].split(',').map((value) => value.trim()).filter(Boolean)
const exported = new Set([...unsaved.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map((entry) => entry[1]))
const missing = imported.filter((name) => !exported.has(name))
if (missing.length) throw new Error(`missing ../../unsaved exports: ${missing.join(', ')}`)
NODE
grep -q 'Only an effective superuser can change' "$PANEL" || fail "read-only superuser policy state missing"
grep -q 'Granting superuser authority remains superuser-only' "$PANEL" || fail "unconditional grant rule not explained"
echo "account-security-policy-ui: PASS"
