export function historyCountLabel(meta, { loaded = false, loading = false } = {}) {
  if (!loaded && loading) return 'loading…'
  if (!loaded) return '— runs'
  return `${Number(meta?.total || 0)} runs`
}

export function historyPageState(data, requestedPage = 1) {
  const rows = Array.isArray(data?.runs) ? data.runs : []
  const page = Number(data?.page || requestedPage || 1)
  const pages = Number(data?.pages || 0)
  const total = Number(data?.total ?? data?.count ?? rows.length)
  const retryPage = pages > 0 && page > pages ? pages : null
  return { rows, meta: { page, pages, total }, retryPage }
}
