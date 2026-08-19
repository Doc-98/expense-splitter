import { useNavigate } from 'react-router-dom'

function Section({ title, children, defaultOpen = false }) {
  return (
    <details className="guide-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="guide-section-body">{children}</div>
    </details>
  )
}

export default function Guide() {
  const navigate = useNavigate()

  return (
    <div className="page">
      <header className="page-header">
        <button type="button" className="btn-link" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>How to use Spesa</h1>
      </header>

      <p className="muted">
        Tap a section to expand it. This covers everything from the basics to the newer, less
        obvious features.
      </p>

      <Section title="Groups: creating, joining, inviting" defaultOpen>
        <p>
          A <strong>group</strong> is a household, trip, or any set of people who share expenses.
          Create one from the groups list, or join an existing one via an invite link.
        </p>
        <p>
          On a group's page, the <strong>Invite</strong> button opens a QR code (great for someone
          standing right next to you) and a <strong>Share invite link</strong> option that uses your
          phone's normal share menu — straight into WhatsApp, Messages, wherever, or copies the link
          if sharing isn't available.
        </p>
      </Section>

      <Section title="Adding a bill and splitting items">
        <p>
          Inside a group, <strong>Start</strong> a new bill, then add items either by typing them in
          by hand or by scanning a receipt photo.
        </p>
        <p>
          Every item has a row of name chips underneath it — <strong>tap a person's chip to
          include or exclude them</strong> from that specific item's split. New items default to
          splitting with everyone currently in the group, unless you've changed the
          <strong> "New items split with"</strong> row near the top of the bill — handy when only
          some of the group actually did that particular shop.
        </p>
        <p>
          <strong>Paid by</strong> controls who fronted the money for the whole bill — this is what
          the settle-up math is built on.
        </p>
      </Section>

      <Section title="Scanning a receipt">
        <p>Three ways to get items onto a bill without typing them all in:</p>
        <ul>
          <li>
            <strong>Free OCR</strong> — works immediately, no setup, entirely on your phone. Best on
            a clear, well-lit photo.
          </li>
          <li>
            <strong>Google Gemini / Anthropic Claude</strong> — more accurate, needs your own API
            key, set up once in <strong>Scan settings</strong> (from the account menu, top right).
          </li>
          <li>
            <strong>A local Ollama model</strong> — private, runs on your own computer, also set up
            in Scan settings.
          </li>
        </ul>
        <p>
          Whichever you pick is remembered on that device going forward — everyone in a group can
          use a different method if they want.
        </p>
      </Section>

      <Section title="Guests — people without an account">
        <p>
          Not everyone splitting a bill wants to install an app and sign up. From{' '}
          <strong>Group settings → Guests</strong>, add anyone by name — they can be assigned to
          items, front a bill, and owe or be owed money exactly like a real account, with no login
          of their own. One person can run the whole group for a party of guests if needed.
        </p>
        <p>
          Removing a guest just archives them — their history stays on old bills, and they can be
          restored any time.
        </p>
      </Section>

      <Section title="Settling up">
        <p>
          Every group page shows a live <strong>Settle up</strong> section — who owes whom, already
          simplified to the fewest payments needed. When money actually changes hands, hit{' '}
          <strong>Mark paid</strong> on a suggested payment, or record one manually (handy for a
          partial payment, or one that doesn't match a suggestion). Made a mistake? Any payment can
          be deleted from the history.
        </p>
      </Section>

      <Section title="Recaps: sharing, PDF, and CSV">
        <p>Both a single bill and a group's settle-up have the same three export options:</p>
        <ul>
          <li>
            <strong>Share recap</strong> — quick, plain text formatted for pasting straight into a
            chat.
          </li>
          <li>
            <strong>Download PDF</strong> — opens your browser's print dialog; choose "Save as PDF."
          </li>
          <li>
            <strong>Export CSV</strong> — a spreadsheet-friendly file, bills only.
          </li>
        </ul>
      </Section>

      <Section title="Importing from Splitwise">
        <p>
          Already tracking expenses in Splitwise? Export your group from Splitwise as a CSV, then
          use <strong>Import bills from Splitwise</strong> on the group page to bring them in. Each
          Splitwise expense becomes one bill, dated to match the original. You'll be asked to match
          each Splitwise name to an existing member or guest before importing.
        </p>
      </Section>

      <Section title="Stats">
        <p>
          <strong>Group stats</strong> (from a group's page) breaks down that group's spending by
          person, by month, and shows the biggest bills. <strong>Your stats</strong> (account menu)
          does the same across every group you're in, plus your overall balance — including a frozen
          record for any group you've since left.
        </p>
        <p>Both let you switch between week, month, year, and all-time views.</p>
      </Section>

      <Section title="Group settings and permissions">
        <p>
          Each group has one <strong>admin</strong> — whoever created it, unless the role's been
          handed to someone else. Only the admin can remove another real member; anyone can leave a
          group themselves any time. If the admin leaves, the role passes automatically to whoever's
          been in the group the longest.
        </p>
        <p>
          Guests are different — any active member can add, rename, or remove a guest, since that's
          managing shared group data rather than removing a person against their will.
        </p>
      </Section>

      <Section title="Dark mode and other account settings">
        <p>
          The account menu (top right) has a dark/light mode toggle, a link back to this guide, Your
          stats, and Scan settings — all in one place.
        </p>
      </Section>
    </div>
  )
}
