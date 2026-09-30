import assert from 'node:assert/strict'
import { copyTextWithFeedback } from '../src/copy-feedback.js'
import { trustPopoverDomId, trustPopoverOpen, trustPopoverTransition } from '../src/system-trust-popover-state.js'
import { clientChangeSiteSearchState, consumeSiteSearchSuppression } from '../src/resource-site-search-state.js'
import { loadScheduleHistoryPage } from '../src/scheduler-history-loader.js'

// L64: production feedback helper converts clipboard failures into UI state.
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => {} } } })
assert.deepEqual(await copyTextWithFeedback('ok'), { copied: true, error: '' })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied') } } } })
assert.deepEqual(await copyTextWithFeedback('x', { failureMessage: 'copy failed' }), { copied: false, error: 'copy failed' })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
assert.match((await copyTextWithFeedback('x')).error, /Clipboard access is unavailable/)

// L68: hover/focus state is explicit and close clears both channels.
let popover = { hover: null, focus: null }
popover = trustPopoverTransition(popover, 'hover', 'release:ui')
assert.equal(trustPopoverOpen(popover, 'release:ui'), true)
popover = trustPopoverTransition(popover, 'focus', 'release:ui')
popover = trustPopoverTransition(popover, 'hover', null)
assert.equal(trustPopoverOpen(popover, 'release:ui'), true, 'keyboard focus must keep popover open after mouse leave')
popover = trustPopoverTransition(popover, 'close')
assert.deepEqual(popover, { hover: null, focus: null })
assert.equal(trustPopoverOpen(popover, 'release:ui'), false)
assert.equal(trustPopoverDomId('release:UI 1'), 'system-trust-popover-release-UI-1')

// L69: clearing an active search skips exactly the synthetic watcher load.
assert.deepEqual(clientChangeSiteSearchState('printer'), { suppressNextSearchLoad: true, nextSearch: '' })
let gate = consumeSiteSearchSuppression(true)
assert.deepEqual(gate, { skipLoad: true, suppressNextSearchLoad: false })
gate = consumeSiteSearchSuppression(gate.suppressNextSearchLoad)
assert.deepEqual(gate, { skipLoad: false, suppressNextSearchLoad: false })
assert.deepEqual(clientChangeSiteSearchState(''), { suppressNextSearchLoad: false, nextSearch: '' })

// L72: page disappearance triggers one request for the new last valid page.
const pages = []
const result = await loadScheduleHistoryPage({
  owner: 'user', page: 5, pageSize: 50, search: '',
  fetchRuns: async ({ page }) => {
    pages.push(page)
    if (page === 5) return { runs: [], page: 5, pages: 3, total: 120 }
    return { runs: [{ id: 'run-3' }], page: 3, pages: 3, total: 120 }
  },
})
assert.deepEqual(pages, [5, 3])
assert.equal(result.ok, true)
assert.equal(result.meta.page, 3)
assert.deepEqual(result.rows, [{ id: 'run-3' }])

// L73: history failures are returned in their own result channel.
const unrelatedError = 'schedule save failed'
const failed = await loadScheduleHistoryPage({
  owner: 'module', page: 1,
  fetchRuns: async () => { throw new Error('history unavailable') },
})
assert.deepEqual(failed, { ok: false, error: 'history unavailable' })
assert.equal(unrelatedError, 'schedule save failed')

console.log('ui partial closure 0.12.47: PASS')
