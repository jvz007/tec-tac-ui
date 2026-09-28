import assert from 'node:assert/strict'
import { coreNavigation } from '../src/core-navigation.js'

const item = (ctx) => coreNavigation(ctx).find((entry) => entry.to === '/resources')
assert.equal(item({ capabilities: {}, user: { superuser: false } }).visible, false)
assert.equal(item({ capabilities: { list_clients: false }, user: { superuser: false } }).visible, false)
assert.equal(item({ capabilities: { list_clients: true }, user: { superuser: false } }).visible, true)
assert.equal(item({ capabilities: { list_clients: false }, user: { superuser: true } }).visible, true)
console.log('core-navigation-resources: PASS')
