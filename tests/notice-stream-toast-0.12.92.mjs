// 0.12.92: notices Core stores itself (Core 1.17.14) reach the page as toasts. The first check only records the backlog,
// a new unread row toasts once and is never posted back, and a notice this page stored itself is not toasted again.
import assert from 'node:assert/strict'
import fs from 'node:fs'

// notifications.js schedules toast timers through window; node has no window, so give it the timers.
globalThis.window = { setTimeout: (...args) => setTimeout(...args), clearTimeout: (timer) => clearTimeout(timer) }
const { createNotificationService } = await import('../src/notifications.js')
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const POLL_PATH = '/api/tfd/ui/notices/?state=unread&limit=100'
const row = (extra = {}) => ({
  id: 'srv-1', source: 'core', level: 'error', title: 'Module job failed', message: 'Enabling alerts failed.',
  action: { label: 'Open Modules', route: '/modules' }, read: false, created_at: '2026-10-10T09:00:00Z', ...extra,
})

function makeService() {
  const requests = []
  const api = {
    unread: [],
    count: 0,
    persistReply: null,
    pending: null,
  }
  const fn = async (path, options = {}) => {
    requests.push({ path, method: options.method || 'GET', body: options.body })
    if ((options.method || 'GET') === 'POST') {
      if (api.pending) return api.pending
      return api.persistReply ? api.persistReply(JSON.parse(options.body)) : { notice: { id: 'stored' }, unread_count: 1 }
    }
    if (path === POLL_PATH) return { notices: api.unread, count: api.unread.length, unread_count: api.unread.length }
    throw new Error(`unexpected request ${path}`)
  }
  const svc = createNotificationService({ api: fn, router: null })
  return { svc, api, requests, posts: () => requests.filter((item) => item.method === 'POST') }
}

// 1. the first check records the backlog and toasts nothing
{
  const { svc, api, requests } = makeService()
  api.unread = [row({ id: 'old-1' }), row({ id: 'old-2', message: 'Older.' })]
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 0, 'backlog is not replayed')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, POLL_PATH)
  assert.equal(requests[0].method, 'GET')
  assert.equal(svc.history.unreadCount, 2, 'the badge count follows the check')

  // 2. a new unread row toasts exactly once, with the row's own level and route, and is not posted back
  api.unread = [row({ id: 'old-1' }), row({ id: 'old-2', message: 'Older.' }), row({ id: 'new-1' })]
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 1)
  const toast = svc.toasts[0]
  assert.equal(toast.level, 'error')
  assert.equal(toast.title, 'Module job failed')
  assert.equal(toast.message, 'Enabling alerts failed.')
  assert.equal(toast.moduleId, 'core')
  assert.equal(toast.action.route, '/modules')
  assert.equal(toast.action.label, 'Open Modules')
  assert.equal(requests.filter((item) => item.method === 'POST').length, 0, 'a server notice is never stored twice')

  // 3. the same rows again toast nothing more
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 1, 'a known row does not toast again')

  svc.toasts.slice().forEach((item) => svc.dismiss(item.id))
}

// 4. a notice this page stored itself is recognised by its id and not toasted again
{
  const { svc, api, posts } = makeService()
  api.unread = []
  await svc.pollServerNotices() // first check: the backlog is empty
  api.persistReply = () => ({ notice: { id: 'own-1' }, unread_count: 1 })
  const id = svc.forModule('core').warning('Saved from this page', { title: 'Saved' })
  await flush()
  assert.equal(posts().length, 1, 'the page stored its own toast once')
  api.unread = [row({ id: 'own-1', level: 'warning', title: 'Saved', message: 'Saved from this page' })]
  await svc.pollServerNotices()
  assert.equal(svc.toasts.filter((item) => item.message === 'Saved from this page').length, 1, 'not toasted twice')
  assert.equal(svc.toasts.length, 1)
  assert.equal(svc.toasts[0].id, id)
  svc.toasts.slice().forEach((item) => svc.dismiss(item.id))
}

// 5. while the page is storing a notice, a check waits; nothing is requested
{
  const { svc, api, requests } = makeService()
  api.unread = []
  await svc.pollServerNotices()
  let release
  api.pending = new Promise((resolve) => { release = () => resolve({ notice: { id: 'busy-1' }, unread_count: 0 }) })
  svc.forModule('core').info('Busy')
  const before = requests.length
  await svc.pollServerNotices()
  assert.equal(requests.length, before, 'no check while a notice is being stored')
  release()
  await flush()
  api.pending = null
  svc.toasts.slice().forEach((item) => svc.dismiss(item.id))
}

// 6. odd rows: an unknown level falls back to info; a link that is not an internal route is dropped but the message
// shows; a row with no id is ignored
{
  const { svc, api } = makeService()
  api.unread = []
  await svc.pollServerNotices()
  api.unread = [
    row({ id: 'lvl-1', level: 'critical', message: 'Odd level.', action: null }),
    row({ id: 'route-1', level: 'warning', message: 'Bad route.', action: { label: 'Go', route: '//evil.example' } }),
    row({ id: '', message: 'No id.' }),
  ]
  await svc.pollServerNotices()
  const byMessage = (text) => svc.toasts.find((item) => item.message === text)
  assert.equal(byMessage('Odd level.').level, 'info')
  assert.equal(byMessage('Odd level.').action, null)
  assert.equal(byMessage('Bad route.').action, null, 'the message shows without the link')
  assert.equal(byMessage('No id.'), undefined)
  svc.toasts.slice().forEach((item) => svc.dismiss(item.id))
}

// 7. starting and stopping the check follows the session: starting checks at once; stopping stops the timer
{
  const { svc, requests } = makeService()
  svc.startServerNoticePolling()
  await flush()
  assert.equal(requests.filter((item) => item.path === POLL_PATH).length, 1, 'checked on start')
  svc.startServerNoticePolling() // a second start does nothing
  await flush()
  assert.equal(requests.filter((item) => item.path === POLL_PATH).length, 1)
  svc.stopServerNoticePolling()
  svc.stopServerNoticePolling()
}

// 8. the shell wires the same lifecycle as session activity tracking
const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
assert.match(app, /notifications\?\.startServerNoticePolling\?\.\(\)/)
assert.match(app, /notifications\?\.stopServerNoticePolling\?\.\(\)/)
assert.match(app, /onBeforeUnmount\(\(\) => \{[^}]*stopServerNoticePolling/)

console.log('notice-stream-toast-0.12.92: ok')
