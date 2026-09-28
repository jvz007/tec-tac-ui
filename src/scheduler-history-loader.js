import { historyPageState } from './scheduler-history-state.js'

export async function loadScheduleHistoryPage({ fetchRuns, owner, page = 1, pageSize = 50, search = '' }) {
  if (typeof fetchRuns !== 'function') throw new TypeError('fetchRuns must be a function')
  let requestedPage = page
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const data = await fetchRuns({ ownerType: owner, page: requestedPage, pageSize, search })
      const state = historyPageState(data, requestedPage)
      if (state.retryPage && state.retryPage !== requestedPage) {
        requestedPage = state.retryPage
        continue
      }
      return { ok: true, rows: state.rows, meta: state.meta }
    }
    return { ok: false, error: 'Scheduler history changed while it was being loaded. Refresh and try again.' }
  } catch (error) {
    return { ok: false, error: error?.message || 'Unable to load Scheduler history.' }
  }
}
