import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserContractRows } from '../src/public-contract-browser.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const docs = [
  'module-runtime-api.md',
  'module-audit.md',
  'context-actions.md',
  'context-interactions.md',
  'module-resource-views.md',
  'module-code-editor.md',
  'module-dashboard-widgets.md',
  'module-quick-actions.md',
  'module-notifications.md',
  'module-help.md',
  'module-header.md',
  'module-status.md',
  'module-sso.md',
]
for (const name of docs) assert.equal(fs.existsSync(path.join(ROOT, 'docs', name)), true, `missing ${name}`)

const sample = {
  browser: [
    { id: 'ui.authenticated.context-actions', phase: 'authenticated', service: 'contextActions', operations: ['register','list','execute'], audience: 'provider/consumer browser', docs: 'tec-tac-ui/docs/context-actions.md', purpose: 'Shared resource actions' },
    { id: 'ui.public.sso-providers', phase: 'public', service: 'ssoProviders', operations: ['register','begin'], audience: 'provider/public-browser', docs: 'tec-tac-ui/docs/module-sso.md', purpose: 'Public SSO providers' },
  ],
}
assert.equal(browserContractRows(sample).length, 2)
assert.deepEqual(browserContractRows(sample, 'execute').map(x => x.id), ['ui.authenticated.context-actions'])
assert.deepEqual(browserContractRows(sample, 'PUBLIC').map(x => x.id), ['ui.public.sso-providers'])
assert.deepEqual(browserContractRows(sample, 'context-actions.md').map(x => x.id), ['ui.authenticated.context-actions'])
assert.equal(browserContractRows({}, 'anything').length, 0)

console.log('[TEST] PASS browser contract catalog UI consumer')
