// Uses the phone's native share sheet when available — straight into
// WhatsApp, Messages, whatever the person picks — falling back to copying
// to the clipboard on desktop browsers that don't support it (most don't).
// Never throws: resolves to 'shared', 'cancelled', 'copied' or 'failed'.
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
  // The clipboard can be missing (an insecure http:// page) or refuse
  // (permission denied, page not focused) — reported rather than thrown, so
  // no caller is left with a button that silently does nothing.
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
