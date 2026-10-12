import assert from 'node:assert/strict'
import { coreNavigation } from '../src/core-navigation.js'

const item = (ctx) => coreNavigation(ctx).find((entry) => entry.to === '/resources')
assert.equal(item({ capabilities: {}, user: { superuser: false } }).visible, false)
assert.equal(item({ capabilities: { list_clients: false }, user: { superuser: false } }).visible, false)
assert.equal(item({ capabilities: { list_clients: true }, user: { superuser: false } }).visible, true)
assert.equal(item({ capabilities: { list_clients: false }, user: { superuser: true } }).visible, true)
// 0.12.96 (Core 1.17.22): List sites alone is enough; the flag is a display hint read from tactical_permissions.
assert.equal(item({ capabilities: {}, tactical_permissions: { can_list_sites: true }, user: { superuser: false } }).visible, true)
assert.equal(item({ capabilities: {}, tactical_permissions: { can_list_sites: false }, user: { superuser: false } }).visible, false)
console.log('core-navigation-resources: PASS')
