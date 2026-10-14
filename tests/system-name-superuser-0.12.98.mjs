// 0.12.98 (Core 1.17.24, AD-12): the system name is for an effective superuser only. Core answers 403 to anyone else, so
// the page shows the name read-only to them. The upload limit and the register time limit keep their own rules.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
// runtime-settings.js imports apiFetch from api.js; a stub keeps the test free of the browser.
const settingsSource = read('../src/runtime-settings.js').replace("import { apiFetch } from './api.js'", 'const apiFetch = async () => { throw new Error("no api") }')
const settings = await import(dataUrl(settingsSource))
const pkg = JSON.parse(read('../tec_tac_package.json'))

// The Core range this release needs.
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.34,<2.0.0')

// (1) canEditSystemName is true only for an effective superuser.
assert.equal(settings.canEditSystemName({ user: { superuser: true }, permissions: [] }), true)
assert.equal(settings.canEditSystemName({ user: { superuser: false }, permissions: ['core.runtime_settings.manage', 'core.privileged_operations'] }), false, 'a role with both permissions is not enough')
assert.equal(settings.canEditSystemName({ user: {}, permissions: ['core.runtime_settings.manage'] }), false)
assert.equal(settings.canEditSystemName({ user: {}, permissions: ['core.privileged_operations'] }), false)
assert.equal(settings.canEditSystemName({}), false)
assert.equal(settings.canEditSystemName(), false)
assert.equal(settings.canEditSystemName(null), false)
assert.equal(settings.canEditSystemName({ user: { superuser: 'true' } }), false, 'only the boolean true counts')

// (2) canEditRuntimeSettings and canEditUploadLimit keep their rules.
assert.equal(settings.canEditRuntimeSettings({ user: {}, permissions: ['core.runtime_settings.manage'] }), true)
assert.equal(settings.canEditRuntimeSettings({ user: {}, permissions: ['core.privileged_operations'] }), true)
assert.equal(settings.canEditRuntimeSettings({ user: {}, permissions: [] }), false)
assert.equal(settings.canEditUploadLimit({ user: { superuser: true } }), true)
assert.equal(settings.canEditUploadLimit({ user: {}, permissions: ['core.runtime_settings.manage', 'core.privileged_operations'] }), false)

// (3) The card: the name form sits behind canEditSystemName, not canEdit.
const card = read('../src/components/RuntimeSettingsCard.vue')
assert.match(card, /const canEditName = computed\(\(\) => canEditSystemName\(state\?\.context\)\)/)
assert.match(card, /<form v-if="canEditName" class="runtime-settings-form" @submit\.prevent="changeName\('save'\)">/)
assert.doesNotMatch(card, /<form v-if="canEdit" class="runtime-settings-form" @submit\.prevent="changeName/)
assert.match(card, /<p v-else class="compact-copy muted">Only a superuser can change the system name\.<\/p>/)
assert.doesNotMatch(card, /core\.runtime_settings\.manage permission, can change this name/)
// The register time limit form still follows canEdit, and the upload limit still follows its superuser rule.
assert.match(card, /<form v-if="canEdit" class="runtime-settings-form" @submit\.prevent="save">/)
assert.match(card, /<form v-if="canEditUpload" class="runtime-settings-form" @submit\.prevent="saveUpload">/)
assert.match(card, /<p v-else class="compact-copy muted">Only a superuser can change this limit\.<\/p>/)
// The read-only name still shows the current name, the default and the length rule.
assert.match(card, /<dt>Current name<\/dt><dd class="mono">\{\{ systemName\.value \}\}<\/dd>/)
assert.match(card, /<dt>Length<\/dt>/)
assert.match(card, /import \{[^}]*canEditSystemName,[^}]*\} from '\.\.\/runtime-settings'/s)

// (4) The Core refusal of a stale session still reaches the card as sent.
assert.match(card, /nameError\.value = error\?\.message \|\| 'The name could not be saved\.'/)

console.log('system name superuser 0.12.98: PASS')
