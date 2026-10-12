// 0.12.96: the one shell Yes or No dialog and its contract. No input field, text only, one at a time.
// register(context).confirm and context.confirm on a context action handler are additive.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CONFIRM_LIMITS, cleanConfirmOptions, confirmCountLine, createConfirmService } from '../src/confirm-dialog.js'
import { createContextActionRegistry } from '../src/context-actions.js'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
async function dataModule(rel, replacements = []) {
  let source = read(rel)
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { bindConfirm } = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

// Option cleaning.
assert.throws(() => cleanConfirmOptions({}), TypeError)
assert.throws(() => cleanConfirmOptions({ question: '   ' }), TypeError)
assert.throws(() => cleanConfirmOptions(null), TypeError)
const zw = String.fromCharCode(0x200b)
const bell = String.fromCharCode(7)
const cleaned = cleanConfirmOptions({ question: `Delete${bell} policy${zw} Servers?\nNow`, target: 'a\tb', count: 3, danger: true })
assert.equal(cleaned.question, 'Delete policy Servers? Now')
assert.equal(cleaned.target, 'a b')
assert.equal(cleaned.count, 3)
assert.equal(cleaned.noun, 'endpoints')
assert.equal(cleaned.yesLabel, 'Yes')
assert.equal(cleaned.noLabel, 'No')
assert.equal(cleaned.danger, true)
assert.equal(cleanConfirmOptions({ question: 'x'.repeat(500) }).question.length, CONFIRM_LIMITS.question)
assert.equal(cleanConfirmOptions({ question: 'q', target: 'x'.repeat(500) }).target.length, CONFIRM_LIMITS.target)
assert.equal(cleanConfirmOptions({ question: 'q', detail: 'x'.repeat(900) }).detail.length, CONFIRM_LIMITS.detail)
assert.equal(cleanConfirmOptions({ question: 'q', noun: 'x'.repeat(90) }).noun.length, CONFIRM_LIMITS.noun)
assert.equal(cleanConfirmOptions({ question: 'q', yesLabel: 'x'.repeat(90) }).yesLabel.length, CONFIRM_LIMITS.label)
for (const bad of [0, -2, 1.5, '3', NaN, null]) assert.equal(cleanConfirmOptions({ question: 'q', count: bad }).count, null, `count ${bad}`)
assert.equal(cleanConfirmOptions({ question: 'q', danger: 'yes' }).danger, false)
assert.equal(cleanConfirmOptions({ question: 'q', target: { a: 1 } }).target, '')
assert.equal(confirmCountLine(340), 'This affects 340 endpoints.')
assert.equal(confirmCountLine(1), 'This affects 1 endpoint.')
assert.equal(confirmCountLine(2, 'policies'), 'This affects 2 policies.')
assert.equal(confirmCountLine(0), '')

// A missing question rejects.
const service = createConfirmService()
await assert.rejects(() => service.confirm({}), TypeError)
assert.equal(service.state.current, null)

// Yes, No, and the queue (one at a time, in order).
const first = service.confirm({ question: 'First?' })
const second = service.confirm({ question: 'Second?' })
assert.equal(service.state.current.question, 'First?')
assert.equal(service.state.pending, 1)
service.answer(true)
assert.equal(await first, true)
assert.equal(service.state.current.question, 'Second?')
service.answer(false)
assert.equal(await second, false)
assert.equal(service.state.current, null)
assert.equal(service.answer(true), false, 'nothing open')

// cancelAll answers false for the open one and the queued ones.
const a = service.confirm({ question: 'A?' })
const b = service.confirm({ question: 'B?' })
const c = service.confirm({ question: 'C?' })
service.cancelAll()
assert.deepEqual(await Promise.all([a, b, c]), [false, false, false])
assert.equal(service.state.current, null)
assert.equal(service.state.pending, 0)

// A module's call shows who is asking; Core's own call does not. An abandoned module is refused.
let abandoned = false
const moduleConfirm = bindConfirm(service.confirm, { moduleId: 'patching', isAbandoned: () => abandoned })
const asked = moduleConfirm({ question: 'Install on 12 endpoints?', count: 12 })
assert.equal(service.state.current.askedBy, 'patching')
service.answer(true)
assert.equal(await asked, true)
const own = service.confirm({ question: 'Core question?' })
assert.equal(service.state.current.askedBy, '')
service.answer(false)
await own
abandoned = true
await assert.rejects(() => moduleConfirm({ question: 'x?' }), /abandoned/)
// A module cannot choose the asker.
abandoned = false
const spoof = moduleConfirm({ question: 'x?', askedBy: 'core' })
assert.equal(service.state.current.askedBy, 'patching')
service.answer(false)
await spoof

// Context action handler: gets confirm, other keys pass through, the shell's confirm wins.
const seen = []
const registry = createContextActionRegistry({ hasPermission: () => true, confirm: service.confirm })
const mod = registry.forModule('patching')
const supplied = () => 'caller'
mod.register({ id: 'patching.install', resource: 'endpoint', label: 'Install', placements: ['toolbar'] }, async (context) => { seen.push(context); return context.confirm({ question: 'Install?' }) })
const run = mod.execute('patching.install', { selection: [1, 2], custom: 'kept', confirm: supplied })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(typeof seen[0].confirm, 'function')
assert.notEqual(seen[0].confirm, supplied, 'the shell value wins')
assert.deepEqual(seen[0].selection, [1, 2])
assert.equal(seen[0].custom, 'kept')
assert.equal(service.state.current.askedBy, 'patching')
service.answer(true)
assert.equal(await run, true)

// A handler registered the old way still runs.
const old = createContextActionRegistry({ hasPermission: () => true })
old.forModule('alerts').register({ id: 'alerts.x', resource: 'endpoint', label: 'X', placements: ['toolbar'] }, async (context) => context.custom)
assert.equal(await old.forModule('alerts').execute('alerts.x', { custom: 'ok', selection: [1] }), 'ok')
const shellLevel = createContextActionRegistry({ hasPermission: () => true, confirm: service.confirm })
shellLevel.forModule('alerts').register({ id: 'alerts.y', resource: 'endpoint', label: 'Y', placements: ['toolbar'] }, async (context) => typeof context.confirm)
assert.equal(await shellLevel.execute('alerts.y', { selection: [1] }), 'function')

// The dialog source: no input, no v-html, an alertdialog, focus on No, Escape answers No.
const dialog = read('../src/components/ConfirmDialog.vue')
assert.doesNotMatch(dialog, /<input|<textarea|<select|v-model/)
assert.doesNotMatch(dialog, /v-html/)
assert.match(dialog, /role="alertdialog"/)
assert.match(dialog, /aria-modal="true"/)
assert.match(dialog, /noButton\.value\?\.focus\(\)/)
assert.match(dialog, /event\.key === 'Escape'/)
assert.match(dialog, /CONFIRM_TITLE/)
assert.match(dialog, /@click\.self="no"/)
// Mounted in App.vue outside the popup condition.
const app = read('../src/App.vue')
const mount = app.split('\n').find((line) => line.includes('<ConfirmDialog'))
assert.ok(mount && !mount.includes('popupLayout'), 'ConfirmDialog is not hidden in a popup window')
assert.ok(app.indexOf('<ConfirmDialog') > app.indexOf('<UnsavedChangesDialog'))
assert.match(app, /confirmService\?\.cancelAll\(\)/)
// main.js provides it and hands it to the loader and the registry.
const main = read('../src/main.js')
assert.match(main, /app\.provide\('tecTacConfirm', confirmService\)/)
assert.match(main, /createContextActionRegistry\(\{ hasPermission, confirm: confirmService\.confirm \}\)/)
const loader = read('../src/module-loader.js')
assert.match(loader, /bindConfirm\(sharedConfirm/)
assert.match(loader, /confirm: sharedConfirm/)

console.log('confirm-dialog-0.12.96: PASS')
