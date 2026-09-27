import assert from 'node:assert/strict'
import { authorizationRevokedState } from '../src/scheduler-health.js'

assert.deepEqual(authorizationRevokedState(null), {
  count: 0,
  visible: false,
  label: '',
  error: '',
})

assert.deepEqual(authorizationRevokedState({ authorization_revoked_last_24h: 0 }), {
  count: 0,
  visible: false,
  label: '',
  error: '',
})

assert.deepEqual(authorizationRevokedState({
  authorization_revoked_last_24h: 3,
  last_authorization_revoked: {
    schedule_id: 'schedule-123',
    schedule_name: 'Patch approval',
    error: 'Schedule targets are no longer within the owner scope.',
  },
}), {
  count: 3,
  visible: true,
  label: 'Patch approval',
  error: 'Schedule targets are no longer within the owner scope.',
})

assert.equal(authorizationRevokedState({
  authorization_revoked_last_24h: 1,
  last_authorization_revoked: { schedule_id: 'schedule-123' },
}).label, 'schedule-123')

console.log('D5 Scheduler health UI behavior: PASS')
