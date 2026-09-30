import assert from 'node:assert/strict'
import fs from 'node:fs'

function makeVueShim() {
  let activeEffect = null
  function ref(initial) {
    let value = initial
    const listeners = new Set()
    return {
      get value() {
        if (activeEffect) listeners.add(activeEffect)
        return value
      },
      set value(next) {
        value = next
        for (const listener of [...listeners]) listener()
      },
    }
  }
  function computed(getter) {
    return { get value() { return getter() } }
  }
  function watch(source, callback) {
    let previous
    const run = () => {
      activeEffect = run
      const next = source.value
      activeEffect = null
      if (previous !== undefined && next !== previous) callback(next, previous)
      previous = next
    }
    activeEffect = run
    previous = source.value
    activeEffect = null
    return () => {}
  }
  const reactive = (value) => value
  const nextTick = async () => Promise.resolve()
  return { ref, computed, watch, reactive, nextTick }
}

const vue = makeVueShim()

let unsavedSource = fs.readFileSync(new URL('../src/unsaved.js', import.meta.url), 'utf8')
unsavedSource = unsavedSource.replace("import { reactive } from 'vue'", 'const reactive = (value) => value')
const unsaved = await import(`data:text/javascript;base64,${Buffer.from(unsavedSource).toString('base64')}`)

let source = fs.readFileSync(new URL('../src/use-account-security-policy.js', import.meta.url), 'utf8')
source = source
  .replace("import { computed, ref, watch } from 'vue'", `const { computed, ref, watch } = globalThis.__TEC_TAC_VUE_TEST_SHIM__`)
  .replace("import { persistAccountSecurityPolicy } from './account-security-policy-save'", `const persistAccountSecurityPolicy = async (requested, updatePolicy) => updatePolicy(requested === true)`)

globalThis.__TEC_TAC_VUE_TEST_SHIM__ = vue
const lifecycle = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

let navigated = false
let persisted = false
const controller = lifecycle.useAccountSecurityPolicy({
  getPolicy: async () => ({ policy: { protect_superuser_accounts: false }, can_change: true }),
  updatePolicy: async () => {
    persisted = true
    throw new Error('server rejected policy')
  },
  registerUnsaved: unsaved.registerUnsaved,
  clearUnsaved: unsaved.clearUnsaved,
})

await controller.loadPolicy()
controller.requested.value = true
await vue.nextTick()
assert.equal(controller.dirty.value, true)
assert.equal(unsaved.unsavedState.dirty, true)

unsaved.requestLeave(() => { navigated = true })
await unsaved.saveAndContinue()

assert.equal(persisted, true)
assert.equal(navigated, false)
assert.equal(controller.requested.value, true)
assert.equal(controller.dirty.value, true)
assert.equal(unsaved.unsavedState.dirty, true)
assert.equal(unsaved.unsavedState.dialogOpen, true)
assert.equal(unsaved.unsavedState.error, 'server rejected policy')

controller.dispose()
delete globalThis.__TEC_TAC_VUE_TEST_SHIM__
console.log('account-security-policy-panel-lifecycle: PASS')
