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
