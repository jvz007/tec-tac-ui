import assert from 'node:assert/strict'
import { historyCountLabel, historyPageState } from '../src/scheduler-history-state.js'

assert.equal(historyCountLabel({ total: 0 }, { loaded: false, loading: false }), '— runs')
assert.equal(historyCountLabel({ total: 0 }, { loaded: false, loading: true }), 'loading…')
assert.equal(historyCountLabel({ total: 0 }, { loaded: true, loading: false }), '0 runs')
assert.equal(historyCountLabel({ total: 12 }, { loaded: true, loading: false }), '12 runs')

assert.deepEqual(historyPageState({ runs: [], page: 4, pages: 3, total: 120 }, 4), {
  rows: [],
  meta: { page: 4, pages: 3, total: 120 },
  retryPage: 3,
})
assert.deepEqual(historyPageState({ runs: [{ id: 'r1' }], page: 2, pages: 3, total: 120 }, 2).retryPage, null)
console.log('scheduler-history-state: PASS')
