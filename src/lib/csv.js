// A minimal RFC4180-ish CSV parser — handles quoted fields (with embedded
// commas and doubled-quote escaping), since real-world exports routinely
// have a comma inside a description or category. A naive text.split(',')
// would silently misparse those rows.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (char === '\r') {
      i++
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += char
    i++
  }

  // Final field/row when the file doesn't end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

// Quotes a field only when it actually needs it (contains a comma, quote,
// or newline) — matches how most spreadsheet tools write CSVs, and keeps
// simple values like plain numbers readable unquoted.
function csvField(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(headerRow, dataRows) {
  const lines = [headerRow, ...dataRows].map((row) => row.map(csvField).join(','))
  return lines.join('\r\n')
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Row builder for exporting one bill's items — kept separate from
// downloadCsv so it can be tested without needing a real browser DOM.
export function buildBillCsvRows(items, members) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const header = ['Item', 'Quantity', 'Unit Price', 'Total Price', 'Split With']
  const rows = items.map((item) => [
    item.name,
    item.quantity,
    Number(item.unit_price).toFixed(2),
    Number(item.total_price).toFixed(2),
    (item.item_shares || []).map((s) => nameOf(s.member_id)).join('; '),
  ])
  return { header, rows }
}

// Local calendar day, not UTC — matches the same convention used
// everywhere else in this app that buckets or displays a date (settlement.js's
// dayKey, recurringBills.js's toDateString), so an export lines up with what
// the app itself already shows for "which day" a bill falls on. ISO-shaped
// (YYYY-MM-DD) rather than a locale-formatted date, though: this is a file
// meant for a spreadsheet or another program to read back in, not a UI
// label, so sorting correctly and reading unambiguously in any locale wins
// over familiarity.
function isoDate(dateStr) {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Row builder for exporting a whole group's spending history — one row per
// item across every bill, the same shape buildBillCsvRows() produces for a
// single bill, plus enough extra columns (date, bill, category, who paid)
// to make sense spanning many bills instead of just one.
//
// Effective category resolution matches computeCategoryTotals() /
// computeMyCategorySpend() elsewhere: an item's own category_id if set,
// otherwise its bill's, otherwise "Uncategorized" — nothing here
// special-cases a bill with no items at all (an empty draft nobody
// finished), it simply contributes zero rows, same as it would to any
// other spending total in this app.
export function buildGroupCsvRows(bills, members, categories) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const categoryNameOf = (id) => categories.find((c) => c.id === id)?.name

  function paidByLabel(bill) {
    if (bill.payers && bill.payers.length > 0) {
      return bill.payers.map((p) => `${nameOf(p.member_id)} (${Number(p.amount).toFixed(2)})`).join('; ')
    }
    return bill.paid_by ? nameOf(bill.paid_by) : ''
  }

  const header = ['Date', 'Bill', 'Item', 'Quantity', 'Unit Price', 'Total Price', 'Category', 'Paid By', 'Split With']
  const rows = []
  for (const bill of bills) {
    const date = isoDate(bill.created_at)
    const paidBy = paidByLabel(bill)
    for (const item of bill.items || []) {
      const categoryId = item.category_id || bill.category_id || null
      rows.push([
        date,
        bill.title,
        item.name,
        item.quantity,
        Number(item.unit_price).toFixed(2),
        Number(item.total_price).toFixed(2),
        (categoryId && categoryNameOf(categoryId)) || 'Uncategorized',
        paidBy,
        (item.item_shares || []).map((s) => nameOf(s.member_id)).join('; '),
      ])
    }
  }
  return { header, rows }
}
