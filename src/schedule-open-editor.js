// 0.12.119: the schedule that is open in the editor. A Created by or Confirmed by filter can drop the open schedule from the list
// Core sends while the editor is still open. The page keeps the row it opened (a snapshot) so the editor still knows which schedule
// it is editing: Save updates it, the Created by block still shows, and nothing the person typed is lost.
const same = (row, id) => Boolean(row) && id !== null && id !== undefined && row.id === id

// The row the editor works on: the one in the list, else the snapshot that was opened, else nothing.
export function openScheduleRow(list, selectedId, snapshot) {
  const inList = (Array.isArray(list) ? list : []).find((row) => row && row.id === selectedId)
  if (inList) return inList
  return same(snapshot, selectedId) ? snapshot : null
}

// True when a refresh may keep selectedId: the list holds it, or the snapshot says it is the open schedule.
export function keepsSelectedId(list, selectedId, snapshot) {
  if (selectedId === null || selectedId === undefined) return false
  return (Array.isArray(list) ? list : []).some((row) => row && row.id === selectedId) || same(snapshot, selectedId)
}
