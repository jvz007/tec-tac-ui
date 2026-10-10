// 0.12.92: the Tactical operation upload limit on System Configuration (Core 1.17.14, CQ40 and CQ44). Whole MiB, 1 to 25,
// 10 MiB by default, superusers only, sent as one PATCH key.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const storage = new Map([['access_token', 'abc123']])
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const {
  RUNTIME_SETTINGS_PATH,
  UPLOAD_LIMIT_KEY,
  canEditUploadLimit,
  getRuntimeSettings,
  getRuntimeSettingsPayload,
  normalizeUploadLimit,
  saveUploadLimit,
  uploadLimitDefaultText,
  uploadLimitRangeText,
  validateUploadLimit,
} = await import('../src/runtime-settings.js')

// The text the page shows.
assert.equal(UPLOAD_LIMIT_KEY, 'tactical_operation_upload_max_mib')
assert.equal(uploadLimitDefaultText(10), '10 MiB by default')
assert.equal(uploadLimitDefaultText(), '10 MiB by default')
assert.equal(uploadLimitRangeText(), '1 to 25 MiB')
assert.equal(uploadLimitRangeText(1, 25), '1 to 25 MiB')

// Only a superuser sees the form. Holding the timeout permission is not enough.
assert.equal(canEditUploadLimit({ user: { superuser: true }, permissions: [] }), true)
assert.equal(canEditUploadLimit({ user: { superuser: false }, permissions: ['core.runtime_settings.manage', 'core.privileged_operations'] }), false)
assert.equal(canEditUploadLimit({ user: {}, permissions: ['core.runtime_settings.manage'] }), false)
assert.equal(canEditUploadLimit({ user: {}, permissions: [] }), false)
assert.equal(canEditUploadLimit({}), false)
assert.equal(canEditUploadLimit(undefined), false)

// Whole MiB from 1 to 25; strings, floats and booleans are refused before any request.
for (const good of [1, 10, 25]) assert.equal(validateUploadLimit(good).valid, true, `${good} is allowed`)
for (const bad of [0, 26, -1, 10.5, '10', null, undefined, true, NaN]) {
  const check = validateUploadLimit(bad)
  assert.equal(check.valid, false, `${String(bad)} is refused`)
  assert.ok(check.message.length > 0, 'a message is given')
}
assert.match(validateUploadLimit('10').message, /whole number of MiB from 1 to 25/)
assert.match(validateUploadLimit(30).message, /must be from 1 to 25 MiB/)

// The current value, range and default come from Core's answer. A missing key shows nothing.
const payload = {
  module_register_timeout_seconds: { value: 30, minimum: 5, maximum: 300, default: 30 },
  [UPLOAD_LIMIT_KEY]: { value: 12, minimum: 1, maximum: 25, default: 10, bytes: 12582912 },
  updated_by: 'admin',
  updated_at: '2026-10-10T08:00:00Z',
}
assert.deepEqual(normalizeUploadLimit(payload), { value: 12, minimum: 1, maximum: 25, default: 10 })
assert.equal(normalizeUploadLimit({ module_register_timeout_seconds: { value: 30 } }), null, 'an older Core shows no section')
assert.equal(normalizeUploadLimit(null), null)
assert.deepEqual(normalizeUploadLimit({ [UPLOAD_LIMIT_KEY]: { value: 'x' } }), { value: 10, minimum: 1, maximum: 25, default: 10 }, 'bad numbers fall back to the documented defaults')

// The read and the write go to the same path; the timeout read still works from the same answer.
{
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return payload
  }
  assert.deepEqual(await getRuntimeSettingsPayload({ api }), payload)
  assert.equal(calls[0].path, RUNTIME_SETTINGS_PATH)
  assert.equal(calls[0].options, undefined)
  assert.equal((await getRuntimeSettings({ api })).value, 30, 'the timeout read is unchanged')
  assert.equal(await getRuntimeSettingsPayload({ api: async () => { throw Object.assign(new Error('Not found'), { status: 404 }) } }), null)
  await assert.rejects(() => getRuntimeSettingsPayload({ api: async () => { throw Object.assign(new Error('down'), { status: 500 }) } }), /down/)
}

// The save sends exactly the one key, as a whole number, with PATCH.
{
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return { [UPLOAD_LIMIT_KEY]: { value: 20, minimum: 1, maximum: 25, default: 10 } }
  }
  const next = await saveUploadLimit(20, { api })
  assert.equal(calls[0].path, RUNTIME_SETTINGS_PATH)
  assert.equal(calls[0].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[0].options.body), { [UPLOAD_LIMIT_KEY]: 20 })
  assert.deepEqual(next, { value: 20, minimum: 1, maximum: 25, default: 10 })
  // a refused value makes no request at all
  let touched = false
  await assert.rejects(() => saveUploadLimit(26, { api: async () => { touched = true; return {} } }), (error) => error.status === 0 && /must be from 1 to 25/.test(error.message))
  await assert.rejects(() => saveUploadLimit('10', { api: async () => { touched = true; return {} } }), (error) => error.status === 0)
  assert.equal(touched, false)
}

// Core's refusals reach the caller unchanged.
globalThis.fetch = async () => json({ detail: 'Only a superuser may change tactical_operation_upload_max_mib.' }, 403)
await assert.rejects(() => saveUploadLimit(12), (error) => error.status === 403 && /Only a superuser/.test(error.message))

// The card: the form is shown only to a superuser, the default reads "10 MiB by default", and the save goes through the helper.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const card = read('../src/components/RuntimeSettingsCard.vue')
assert.match(card, /<form v-if="canEditUpload" class="runtime-settings-form" @submit\.prevent="saveUpload">/)
assert.match(card, /const canEditUpload = computed\(\(\) => canEditUploadLimit\(state\?\.context\)\)/)
assert.match(card, /<p v-else class="compact-copy muted">Only a superuser can change this limit\.<\/p>/)
assert.match(card, /<dd class="mono">\{\{ uploadDefault \}\}<\/dd>/)
assert.match(card, /uploadLimitDefaultText\(uploadLimit\.value\.default\)/)
assert.match(card, /uploadLimitRangeText\(uploadLimit\.value\.minimum, uploadLimit\.value\.maximum\)/)
assert.match(card, /await saveUploadLimit\(uploadDraft\.value\)/)
assert.match(card, /getRuntimeSettingsPayload\(\)/)
// the timeout form and its wording stay as 0.12.81 shipped them
assert.match(card, /<form v-if="canEdit"/)
assert.match(card, /applies the next time the page is loaded/)
assert.match(card, /core\.privileged_operations or core\.runtime_settings\.manage/)

// The page shows the same default and range text that the helpers produce.
assert.equal(uploadLimitDefaultText(payload[UPLOAD_LIMIT_KEY].default), '10 MiB by default')
assert.equal(uploadLimitRangeText(payload[UPLOAD_LIMIT_KEY].minimum, payload[UPLOAD_LIMIT_KEY].maximum), '1 to 25 MiB')

console.log('upload-limit-setting-0.12.92: ok')
