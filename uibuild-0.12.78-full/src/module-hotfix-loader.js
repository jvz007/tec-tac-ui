export async function loadLatestHotfixRows({ moduleId, listHotfixes, requestGate, isSelected }) {
  const requestId = requestGate.begin()
  try {
    const data = await listHotfixes(moduleId)
    if (!requestGate.isCurrent(requestId) || !isSelected(moduleId)) return { stale: true }
    return { stale: false, rows: data?.hotfixes || [], error: '' }
  } catch (error) {
    if (!requestGate.isCurrent(requestId) || !isSelected(moduleId)) return { stale: true }
    return { stale: false, rows: [], error: error?.message || 'Unable to load applied hotfixes.' }
  }
}
