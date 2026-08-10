import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="btn-link">
          ← Back
        </Link>
        <h1>About</h1>
      </header>

      <p>
        Spesa is a small, no-frills tool for splitting grocery receipts and other shared costs with
        the people you actually shop with — a flatmate, a partner, a trip's worth of friends.
      </p>
      <p>
        Snap a photo of a receipt (or type it in by hand), decide who's actually splitting each
        item, and see who owes whom, live, on everyone's phone at once. When money actually
        changes hands, record it — the running balance updates instantly for the whole group.
      </p>
      <p className="muted">
        Built as a from-scratch rebuild of an old desktop tool, to replace juggling a separate
        receipt-splitting app and a separate debt-tracking app with just one.
      </p>
    </div>
  )
}
