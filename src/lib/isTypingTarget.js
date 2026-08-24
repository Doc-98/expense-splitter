// Whether `el` is something that already consumes ordinary keystrokes on
// its own — a text field, a <select>, or anything contenteditable. Every
// global keyboard shortcut in the app (arrow-key list navigation, "/" to
// jump to search, etc.) checks this against document.activeElement before
// acting, so typing a note, a price, or a search query never gets
// hijacked mid-keystroke by a shortcut meant for the page around it.
export function isTypingTarget(el) {
  return Boolean(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}
