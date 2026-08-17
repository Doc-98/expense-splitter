// Uses the phone's native share sheet when available — straight into
// WhatsApp, Messages, whatever the person picks — falling back to copying
// to the clipboard on desktop browsers that don't support it (most don't).
export async function shareOrCopyText(text, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled' // person closed the share sheet, not a failure
      // fall through to clipboard if sharing itself failed for some other reason
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
