// Deliberately plain localStorage, not a database table: this is a
// per-device preference (which strategy to try, and — for BYOK — a key that
// belongs to this person alone), and keeping it off the server means there's
// nothing here for a self-hosted instance's owner to secure or leak.

const STORAGE_KEY = 'spesa-receipt-settings'

const DEFAULTS = {
  strategyId: 'spatial', // always-available, zero-config fallback
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  claudeApiKey: '',
  claudeModel: 'claude-sonnet-5',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5vl',
  ocrLanguage: 'eng+ita',
  // Free-text, entirely optional — read by the bill-categorization wizard
  // (see billCategorization/classifyPrompt.js) alongside every title batch
  // it sends. Exists because the model has nothing to go on beyond the
  // titles and category names themselves: it doesn't know what language a
  // household's bills are typically written in, which of its own words are
  // ambiguous between languages ("gas" reads as fuel in English but is
  // often a gas *utility* bill in Italian), or which one-word titles are
  // shorthand for a recurring bill. A household fills this in once and it
  // applies to every group's run, not just one.
  categorizeHint: '',
  // Whether a CSV/Excel bank statement import should ask the configured AI
  // service to double-check its own free, offline column match (see
  // bankStatementColumns/) — on by default, since it's a pure double-check
  // that never applies silently (see bankStatementTabular.js), but some
  // people would rather opt out entirely: unlike the PDF import path,
  // which needs AI by design, CSV/Excel's own heuristic already works
  // standalone, so someone temporarily out of API quota (or who'd simply
  // rather not send transaction data to a third party for this) can turn
  // this one thing off without losing CSV/Excel import altogether.
  bankStatementAiColumnCheck: true,
}

export function getReceiptSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setReceiptSettings(partial) {
  const next = { ...getReceiptSettings(), ...partial }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
