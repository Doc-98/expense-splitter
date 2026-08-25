import { createPortal } from 'react-dom'

// Renders `children` into #print-root (see index.html) instead of wherever
// this component sits in the normal component tree — every printable
// recap (bill, settle-up, stats) uses this rather than a plain wrapper
// div, so the print stylesheet only ever has to hide #root and show
// #print-root, never reason about this content's actual position nested
// somewhere inside the page it was rendered from. #print-root always
// exists (it's static markup in index.html, not created on demand), so
// there's no null-target case to guard against here.
export default function PrintPortal({ children }) {
  return createPortal(children, document.getElementById('print-root'))
}
