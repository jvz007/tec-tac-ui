import { reactive } from 'vue'

export const unsavedState = reactive({
  dirty: false,
  owner: null,
  label: '',
  dialogOpen: false,
  busy: false,
  error: '',
})

let saveHandler = null
let discardHandler = null
let pendingAction = null

export function registerUnsaved(owner, label, handlers = {}) {
  unsavedState.dirty = true
  unsavedState.owner = owner
  unsavedState.label = label || 'Unsaved changes'
  unsavedState.error = ''
  saveHandler = handlers.save || null
  discardHandler = handlers.discard || null
}

export function clearUnsaved(owner = null) {
  if (owner && unsavedState.owner && owner !== unsavedState.owner) return
  unsavedState.dirty = false
  unsavedState.owner = null
  unsavedState.label = ''
  unsavedState.error = ''
  saveHandler = null
  discardHandler = null
}

export function requestLeave(action) {
  if (!unsavedState.dirty) {
    action?.()
    return true
  }
  pendingAction = action || null
  unsavedState.error = ''
  unsavedState.dialogOpen = true
  return false
}

export function stayOnPage() {
  pendingAction = null
  unsavedState.dialogOpen = false
  unsavedState.error = ''
}

async function continuePending() {
  const action = pendingAction
  pendingAction = null
  unsavedState.dialogOpen = false
  action?.()
}

export async function saveAndContinue() {
  if (!saveHandler || unsavedState.busy) return
  unsavedState.busy = true
  unsavedState.error = ''
  try {
    await saveHandler()
    if (unsavedState.dirty) throw new Error('Changes are still marked unsaved after the save completed.')
    await continuePending()
  } catch (error) {
    unsavedState.error = error?.message || 'Unable to save changes.'
  } finally {
    unsavedState.busy = false
  }
}

export async function discardAndContinue() {
  if (unsavedState.busy) return
  unsavedState.busy = true
  unsavedState.error = ''
  try {
    if (discardHandler) await discardHandler()
    clearUnsaved()
    await continuePending()
  } catch (error) {
    unsavedState.error = error?.message || 'Unable to discard changes.'
  } finally {
    unsavedState.busy = false
  }
}
