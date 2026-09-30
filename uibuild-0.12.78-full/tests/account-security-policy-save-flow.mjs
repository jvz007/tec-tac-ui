import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = new URL('../', import.meta.url)
const helper = await import(new URL('../src/account-security-policy-save.js', import.meta.url))
let unsavedSource = fs.readFileSync(new URL('../src/unsaved.js', import.meta.url), 'utf8')
unsavedSource = unsavedSource.replace("import { reactive } from 'vue'", 'const reactive = (value) => value')
const unsaved = await import(`data:text/javascript;base64,${Buffer.from(unsavedSource).toString('base64')}`)

let requested = false
let navigated = false
const failingUpdate = async () => { throw new Error('server rejected policy') }

unsaved.registerUnsaved('account-security-policy', 'Superuser account protection policy', {
  save: async () => helper.persistAccountSecurityPolicy(requested, failingUpdate),
})
unsaved.requestLeave(() => { navigated = true })
await unsaved.saveAndContinue()

if (navigated) throw new Error('failed save navigated away')
if (!unsaved.unsavedState.dirty) throw new Error('failed save cleared dirty state')
if (!unsaved.unsavedState.dialogOpen) throw new Error('failed save closed unsaved dialog')
if (unsaved.unsavedState.error !== 'server rejected policy') throw new Error(`unexpected dialog error: ${unsaved.unsavedState.error}`)
if (requested !== false) throw new Error('failed save changed the requested value')

console.log('account-security-policy-save-flow: PASS')
