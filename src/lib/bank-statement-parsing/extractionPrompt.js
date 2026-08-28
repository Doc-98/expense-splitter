import { parseJsonResponse } from '../parseJsonResponse'

// Shared by both document-capable strategies (Claude, Gemini) — kept in one
// place so the two don't quietly drift out of sync, same reasoning as
// receipt-parsing/extractionPrompt.js. There's no local/offline fallback
// here the way spatialStrategy is for receipts: reading a multi-page PDF
// statement needs a real model behind it, not pixel-position heuristics —
// see bank-statement-parsing/index.js for how that's surfaced.
export function buildBankStatementPrompt() {
  return `You are reading a bank or credit card statement (a PDF export, possibly several pages). Extract every individual transaction line — not the running balance, not the opening/closing balance, not summary or subtotal rows, not the account holder's name, account number, or any marketing text.

Return ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"transactions": [{"date": "YYYY-MM-DD", "description": "string", "amount": number, "direction": "debit" | "credit"}]}

Rules:
- "date" is the transaction's own date (not the statement period's start or end date), in YYYY-MM-DD format.
- "amount" is always positive — use "direction" to say which way the money moved: "debit" for money leaving the account (a purchase, a payment, a fee, an outgoing transfer), "credit" for money arriving (a deposit, a refund, a salary payment, an incoming transfer).
- "description" is the transaction's own description/payee text as printed, cleaned of obvious noise (trailing reference numbers, card-terminal codes, repeated account digits) but still recognizable — don't rewrite it or guess at what the merchant "really" is.
- If a page is entirely unreadable, skip it rather than guessing at its contents — an incomplete but accurate extraction is far better than a confidently wrong one.
- If you cannot read the statement at all, return {"transactions": []}.`
}

// Defensive against a transaction the model returned but couldn't fully
// fill in (missing date, description, or a non-numeric amount) — dropped
// here rather than surfaced as a broken row in the review table; the same
// "an honest gap beats a confidently wrong entry" reasoning as the prompt
// itself. `direction` defaults to 'debit' for anything that isn't
// literally "credit" — a statement is overwhelmingly debits, and a
// mis-tagged credit is the safer failure mode (it shows up for review) than
// a mis-tagged debit silently defaulting to "income, don't import."
export function extractBankTransactions(rawText) {
  const raw = parseJsonResponse(rawText).transactions || []
  return raw
    .filter((t) => t && t.date && t.description && Number.isFinite(Number(t.amount)))
    .map((t) => ({
      date: t.date,
      description: String(t.description).trim(),
      amount: Math.abs(Number(t.amount)),
      direction: t.direction === 'credit' ? 'credit' : 'debit',
    }))
}
