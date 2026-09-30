import assert from 'node:assert/strict'
import fs from 'node:fs'
import { emptyRuntimeContext, normalizeBackendRuntimeContext } from '../src/runtime-context.js'

const empty = emptyRuntimeContext({ username: 'operator' })
assert.deepEqual(empty.tactical_web_ui, { installed: false, url: null })

const installed = normalizeBackendRuntimeContext({
  user: { username: 'operator' },
  tactical_web_ui: { installed: true, url: '/' },
}, {})
assert.deepEqual(installed.tactical_web_ui, { installed: true, url: '/' })

const absent = normalizeBackendRuntimeContext({ user: { username: 'operator' } }, {})
assert.deepEqual(absent.tactical_web_ui, { installed: false, url: null })

const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
assert.match(app, /tacticalWebUiInstalled = computed\(\(\) => tacticalWebUi\.value\.installed === true && !!tacticalWebUi\.value\.url\)/)
assert.match(app, /v-if="!publicRoute && tacticalWebUiInstalled"[^>]*title="Open Tactical in a new window"/)
assert.match(app, /window\.open\(tacticalWebUi\.value\.url, '_blank', 'noopener,noreferrer'\)/)
assert.doesNotMatch(app, /window\.location\.href\s*=\s*'\/'/)
console.log('Tactical button availability/new-window behavior 0.12.73: PASS')
