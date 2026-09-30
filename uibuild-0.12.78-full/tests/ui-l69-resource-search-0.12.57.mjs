import assert from 'node:assert/strict'
import { createResourceSiteSearchCoordinator } from '../src/resource-site-search-state.js'

let search = 'printer'
const seen = []
let scheduled = 0
let cancelled = 0
const coordinator = createResourceSiteSearchCoordinator({
  cancelScheduled: () => { cancelled += 1 },
  clearSearch: () => { search = '' },
  loadImmediate: () => { seen.push(search) },
  scheduleLoad: () => { scheduled += 1 },
})

// Exact ResourcesView ordering: suppress the watcher caused by clearing search,
// clear the search, and only then issue the immediate client-site load.
coordinator.clientChanged(search)
assert.deepEqual(seen, [''], 'client change must load the new client with an empty search term')
assert.equal(search, '', 'client change must clear the visible site search')
assert.equal(seen.length, 1, 'client change must trigger exactly one immediate site load')

coordinator.searchChanged() // synthetic watcher caused by clearSearch()
assert.equal(scheduled, 0, 'synthetic siteSearch reset must not schedule a duplicate load')
assert.equal(seen.length + scheduled, 1)

// Suppression is one-shot; next real operator search must load.
search = 'server'
coordinator.searchChanged()
assert.equal(scheduled, 1, 'next genuine site search must schedule a load')

// No active search means no synthetic search watcher, so next real search is not suppressed.
search = ''
coordinator.clientChanged(search)
assert.deepEqual(seen, ['', ''])
search = 'switch'
coordinator.searchChanged()
assert.equal(scheduled, 2)

coordinator.reset()
assert.ok(cancelled >= 1)
console.log('UI 0.12.57 L69 resource-site search coordinator: PASS')
