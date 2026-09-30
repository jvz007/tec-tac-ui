export async function copyTextToClipboard(text, { unavailableMessage = 'Clipboard access is unavailable in this browser.', failureMessage = 'Could not copy to the clipboard.' } = {}) {
  const value = String(text ?? '')
  const clipboard = globalThis.navigator?.clipboard
  if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error(unavailableMessage)
  try {
    await clipboard.writeText(value)
  } catch {
    throw new Error(failureMessage)
  }
  return true
}
