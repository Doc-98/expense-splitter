import { useState } from 'react'
import { getReceiptSettings, setReceiptSettings } from '../lib/receiptSettings'

// The actual "how should receipts be scanned" UI/logic, pulled out of what
// used to be ScanSettings.jsx's whole page so it can be reused two ways:
// standalone at /scan-settings (still there, for the existing deep links
// from ScanReceiptButton.jsx and CategorizeBills.jsx), and collapsed inside
// the Settings page for anyone browsing in from there instead.
// ScanSettings.jsx itself is now just this plus a page header — see it for
// that wrapper.
export default function ScanSettingsSection() {
  const [settings, setSettings] = useState(getReceiptSettings())
  const [saved, setSaved] = useState(false)

  function update(partial) {
    const next = setReceiptSettings(partial)
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <>
      <p className="muted">
        These settings live only on this device — nothing here is sent anywhere except directly to
        whichever service you choose below, using your own key.
      </p>

      <h2 className="settings-section-title">How should receipts be read?</h2>

      <label className="scan-option">
        <input
          type="radio"
          name="strategy"
          checked={settings.strategyId === 'spatial'}
          onChange={() => update({ strategyId: 'spatial' })}
        />
        <div>
          <strong>Free OCR (default)</strong>
          <p className="muted">
            Runs entirely on this device, no account or key needed. Works best on clearly-lit, roughly
            two-column receipts (item on the left, price on the right) — the same layout almost every
            receipt uses.
          </p>
        </div>
      </label>

      <label className="scan-option">
        <input
          type="radio"
          name="strategy"
          checked={settings.strategyId === 'gemini'}
          onChange={() => update({ strategyId: 'gemini' })}
        />
        <div>
          <strong>Google Gemini (your API key)</strong>
          <p className="muted">
            More accurate, handles messy or unusual receipts better. Needs a free API key from{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
            . Free tier covers ordinary household use comfortably.
          </p>
        </div>
      </label>

      {settings.strategyId === 'gemini' && (
        <div className="scan-option-detail">
          <label>
            Gemini API key
            <input
              type="password"
              value={settings.geminiApiKey}
              onChange={(e) => update({ geminiApiKey: e.target.value })}
              placeholder="AIza…"
            />
          </label>
          <p className="muted">
            Google is retiring unrestricted keys — when creating yours, make sure it's restricted to
            the Gemini API (new keys do this automatically by default).
          </p>
          <label>
            Model (advanced — only change this if Google renames or retires the default)
            <input
              type="text"
              value={settings.geminiModel}
              onChange={(e) => update({ geminiModel: e.target.value })}
              placeholder="gemini-2.5-flash"
            />
          </label>
        </div>
      )}

      <label className="scan-option">
        <input
          type="radio"
          name="strategy"
          checked={settings.strategyId === 'claude'}
          onChange={() => update({ strategyId: 'claude' })}
        />
        <div>
          <strong>Anthropic Claude (your API key)</strong>
          <p className="muted">
            Same model this app's own scanning used to run on, now with your own key instead of a
            shared server one. Get a key at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            — this one isn't a free tier, receipt scans just cost well under a cent each.
          </p>
        </div>
      </label>

      {settings.strategyId === 'claude' && (
        <div className="scan-option-detail">
          <label>
            Claude API key
            <input
              type="password"
              value={settings.claudeApiKey}
              onChange={(e) => update({ claudeApiKey: e.target.value })}
              placeholder="sk-ant-…"
            />
          </label>
          <label>
            Model (advanced)
            <input
              type="text"
              value={settings.claudeModel}
              onChange={(e) => update({ claudeModel: e.target.value })}
              placeholder="claude-sonnet-5"
            />
          </label>
        </div>
      )}

      <label className="scan-option">
        <input
          type="radio"
          name="strategy"
          checked={settings.strategyId === 'ollama'}
          onChange={() => update({ strategyId: 'ollama' })}
        />
        <div>
          <strong>Local Ollama (private, your own hardware)</strong>
          <p className="muted">
            Runs on a computer on your own network — nothing about the receipt ever leaves your house.
            No cost, no account, but needs a decent computer and some setup.
          </p>
        </div>
      </label>

      {settings.strategyId === 'ollama' && (
        <div className="scan-option-detail">
          <p className="status-error">
            Important: Ollama blocks requests from other origins by default. On the machine running
            Ollama, set the environment variable <code>OLLAMA_ORIGINS</code> to include this app's
            address (or <code>*</code> to allow anywhere), then restart Ollama — otherwise every scan
            will fail with a network error even though Ollama is running fine.
          </p>
          <label>
            Ollama server address
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={(e) => update({ ollamaUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </label>
          <p className="muted">
            Use <code>http://localhost:11434</code> if Ollama runs on this same device, or a LAN
            address like <code>http://192.168.1.20:11434</code> if it runs on another computer on your
            network.
          </p>
          <label>
            Model (must be a vision-capable model you've already pulled)
            <input
              type="text"
              value={settings.ollamaModel}
              onChange={(e) => update({ ollamaModel: e.target.value })}
              placeholder="qwen2.5vl"
            />
          </label>
          <p className="muted">
            <code>qwen2.5vl</code> and <code>llama3.2-vision</code> are both solid choices — run{' '}
            <code>ollama pull qwen2.5vl</code> on that machine first if you haven't already.
          </p>
        </div>
      )}

      <h2 className="settings-section-title">OCR language</h2>
      <p className="muted">
        Only used by the free OCR option. Tesseract language codes, joined with "+" for multiple —
        e.g. <code>eng</code>, <code>ita</code>, or <code>eng+ita</code> for both.
      </p>
      <input
        type="text"
        value={settings.ocrLanguage}
        onChange={(e) => update({ ocrLanguage: e.target.value })}
        placeholder="eng+ita"
      />

      {saved && <p className="status-success">Saved</p>}
    </>
  )
}
