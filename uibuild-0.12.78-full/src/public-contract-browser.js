export function browserContractRows(data, query = '') {
  const needle = String(query || '').trim().toLowerCase()
  const rows = Array.isArray(data?.browser) ? data.browser : []
  if (!needle) return rows.slice()
  return rows.filter((item) => [
    item?.id,
    item?.phase,
    item?.service,
    item?.audience,
    item?.docs,
    item?.purpose,
    ...(Array.isArray(item?.operations) ? item.operations : []),
  ].some((value) => String(value ?? '').toLowerCase().includes(needle)))
}
