import { copyTextToClipboard } from './clipboard.js'

export async function copyTextWithFeedback(text, options = {}) {
  const failureMessage = options.failureMessage || 'Could not copy to the clipboard.'
  try {
    await copyTextToClipboard(text, options)
    return { copied: true, error: '' }
  } catch (error) {
    return { copied: false, error: error?.message || failureMessage }
  }
}
