// 0.12.119 (held Low from 0.12.118): the log download no longer revokes its object URL in the same tick as click(). With fake timers
// and a fake revoke: not revoked at 0 ms or 29 s, revoked at 30 s, revoked once on unmount if still pending, never twice.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { createUrlKeeper, REVOKE_AFTER_MS } = await import(new URL('../src/object-url-keeper.js', import.meta.url).href)
assert.equal(REVOKE_AFTER_MS, 30000)

function harness() {
  let now = 0
  let nextId = 1
  const timers = new Map()
  const revoked = []
  const keeper = createUrlKeeper({
    revoke: (url) => revoked.push(url),
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id },
    clearTimer: (id) => { timers.delete(id) },
  })
  const advance = (ms) => {
    now += ms
    for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn() }
  }
  return { keeper, revoked, advance, timers }
}

{
  const t = harness()
  t.keeper.keep('blob:a')
  t.advance(0)
  assert.deepEqual(t.revoked, [], 'not revoked at 0 ms')
  t.advance(29000)
  assert.deepEqual(t.revoked, [], 'not revoked at 29 s')
  t.advance(1000)
  assert.deepEqual(t.revoked, ['blob:a'], 'revoked at 30 s')
  t.keeper.flush()
  t.advance(60000)
  assert.deepEqual(t.revoked, ['blob:a'], 'never twice, not on unmount after the timer fired')
  assert.equal(t.timers.size, 0)
}
{
  const t = harness()
  t.keeper.keep('blob:b')
  t.advance(5000)
  t.keeper.flush() // the window unmounts
  assert.deepEqual(t.revoked, ['blob:b'], 'revoked at once on unmount while pending')
  assert.equal(t.timers.size, 0, 'the timer is cleared')
  t.advance(60000)
  t.keeper.flush()
  assert.deepEqual(t.revoked, ['blob:b'], 'once')
  assert.equal(t.keeper.pending, '', 'nothing stays alive')
}
{
  const t = harness()
  t.keeper.keep('blob:c')
  t.advance(10000)
  t.keeper.keep('blob:d') // a second download
  assert.deepEqual(t.revoked, ['blob:c'], 'the earlier URL is revoked when a new one replaces it')
  t.advance(29000)
  assert.deepEqual(t.revoked, ['blob:c'], 'the new URL has its own 30 s')
  t.advance(1000)
  assert.deepEqual(t.revoked, ['blob:c', 'blob:d'])
  t.keeper.keep('')
  t.keeper.flush()
  assert.deepEqual(t.revoked, ['blob:c', 'blob:d'], 'an empty URL is ignored')
}

// the window uses it
const source = fs.readFileSync(new URL('../src/components/modules/ModuleJobLogWindow.vue', import.meta.url), 'utf8')
assert.ok(!/setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 0\)/.test(source), 'no revoke at 0 ms')
assert.match(source, /urlKeeper\.keep\(url\)/)
assert.match(source, /onBeforeUnmount\(\(\) => \{ gate\.begin\(\); urlKeeper\.flush\(\) \}\)/, 'revoked on unmount')
assert.match(source, /if \(url\) URL\.revokeObjectURL\(url\)/, 'a URL that was never handed over is not left alive')
console.log('job-log-download-revoke-0.12.119: ok')
