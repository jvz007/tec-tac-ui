import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createLatestRequestGate } from '../src/admin-session-state.js'
import { loadLatestHotfixRows } from '../src/module-hotfix-loader.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const gate = createLatestRequestGate()
let selected = 'module-a'
const a = deferred()
const b = deferred()
const listHotfixes = id => id === 'module-a' ? a.promise : b.promise
const first = loadLatestHotfixRows({ moduleId:'module-a', listHotfixes, requestGate:gate, isSelected:id => selected === id })
selected = 'module-b'
const second = loadLatestHotfixRows({ moduleId:'module-b', listHotfixes, requestGate:gate, isSelected:id => selected === id })
b.resolve({ hotfixes:[{ id:'b-1' }] })
assert.deepEqual(await second, { stale:false, rows:[{ id:'b-1' }], error:'' })
a.resolve({ hotfixes:[{ id:'a-old' }] })
assert.equal((await first).stale, true, 'older module hotfix response must be stale')

const errorGate = createLatestRequestGate()
selected = 'module-a'
const oldError = deferred()
const newOk = deferred()
const old = loadLatestHotfixRows({ moduleId:'module-a', listHotfixes:id => id === 'module-a' ? oldError.promise : newOk.promise, requestGate:errorGate, isSelected:id => selected === id })
selected = 'module-b'
const fresh = loadLatestHotfixRows({ moduleId:'module-b', listHotfixes:id => id === 'module-a' ? oldError.promise : newOk.promise, requestGate:errorGate, isSelected:id => selected === id })
newOk.resolve({ hotfixes:[] })
assert.equal((await fresh).stale, false)
oldError.reject(new Error('old module failed'))
assert.equal((await old).stale, true, 'stale hotfix error must not publish')

const source = fs.readFileSync(new URL('../src/views/ModulesView.vue', import.meta.url), 'utf8')
assert.match(source, /loadLatestHotfixRows/)
assert.match(source, /isSelected:\(id\)=>hotfixSelectedModuleId\.value===id/)
assert.match(source, /onBeforeUnmount\(\(\) => \{ hotfixRowsRequestGate\.begin\(\)/)

console.log('ui-0.12.54: PASS')
