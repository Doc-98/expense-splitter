import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Each section carries its own plain-text `keywords` separate from the JSX
// body it renders — searching rendered JSX at runtime would be fragile;
// this way the search has exact, deliberate control over what a query like
// "qr" or "budget" actually matches, independent of the prose wording.
const GROUPS = [
  {
    label: 'Getting started',
    sections: [
      {
        id: 'groups',
        title: 'Groups: creating, joining, inviting',
        keywords: 'group household trip create join invite qr code share link',
        defaultOpen: true,
        body: (
          <>
            <p>
              A <strong>group</strong> is a household, trip, or any set of people who share
              expenses. Create one from the groups list, or join an existing one via an invite
              link.
            </p>
            <p>
              On a group's page, the <strong>Invite</strong> button opens a QR code (great for
              someone standing right next to you) and a <strong>Share invite link</strong> option
              that uses your phone's normal share menu — straight into WhatsApp, Messages,
              wherever, or copies the link if sharing isn't available.
            </p>
          </>
        ),
      },
      {
        id: 'guests',
        title: 'Guests — people without an account',
        keywords: 'guest no account party archive restore',
        body: (
          <>
            <p>
              Not everyone splitting a bill wants to install an app and sign up. From{' '}
              <strong>Group settings → Guests</strong>, add
              anyone by name — they can be assigned to items, front a bill, and owe or be owed
              money exactly like a real account, with no login of their own. One person can run
              the whole group for a party of guests if needed.
            </p>
            <p>
              Removing a guest just archives them — their history stays on old bills, and they
              can be restored any time.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: 'Bills & splitting',
    sections: [
      {
        id: 'adding-a-bill',
        title: 'Adding a bill and splitting items',
        keywords: 'bill item add scan type manual paid by default split pagination page',
        body: (
          <>
            <p>
              Inside a group, <strong>Start</strong> a new bill, then add items either by typing
              them in by hand or by scanning a receipt photo.
            </p>
            <p>
              Every item has a row of name chips underneath it — <strong>tap a person's chip to
              include or exclude them</strong> from that specific item's split. New items default
              to splitting with everyone currently in the group, unless you've changed the{' '}
              <strong>"New items split with"</strong> row near the top of the bill — handy when
              only some of the group actually did that particular shop.
            </p>
            <p>
              <strong>Paid by</strong> controls who fronted the money — usually one person, but
              see <strong>Multiple payers</strong> below if more than one person chipped in.
            </p>
            <p>
              A group with a lot of bills shows 15 at a time with a page selector at the bottom,
              newest first — handy after importing a big batch from Splitwise.
            </p>
          </>
        ),
      },
      {
        id: 'scanning',
        title: 'Scanning a receipt',
        keywords: 'scan ocr gemini claude ollama photo camera api key',
        body: (
          <>
            <p>Three ways to get items onto a bill without typing them all in:</p>
            <ul>
              <li>
                <strong>Free OCR</strong> — works immediately, no setup, entirely on your phone.
                Best on a clear, well-lit photo.
              </li>
              <li>
                <strong>Google Gemini / Anthropic Claude</strong> — more accurate, needs your own
                API key, set up once in <strong>Scan settings</strong> (account menu, top right).
              </li>
              <li>
                <strong>A local Ollama model</strong> — private, runs on your own computer, also
                set up in Scan settings.
              </li>
            </ul>
            <p>
              Whichever you pick is remembered on that device going forward — everyone in a group
              can use a different method if they want.
            </p>
          </>
        ),
      },
      {
        id: 'multiple-payers',
        title: 'Multiple payers',
        keywords: 'multiple payers split front money paid by several people confirm cancel',
        body: (
          <>
            <p>
              If more than one person fronted a bill, choose <strong>Multiple payers…</strong>{' '}
              from the "Paid by" list. A small window opens where you can check off anyone who
              contributed and type in exactly how much each of them paid.
            </p>
            <p>
              Nothing is saved until the amounts add up to <em>exactly</em> the bill's total — a
              red message explains the gap until they do, and Confirm stays disabled. Closing the
              window without confirming discards whatever you were typing; the last saved split is
              untouched either way.
            </p>
            <p>
              If you add another item after confirming a split, changing the total, a red warning
              appears right on the bill until the split is fixed to match again — the bill still
              works normally in the meantime.
            </p>
          </>
        ),
      },
      {
        id: 'categories',
        title: 'Categories: tracking how you spend, not just how much',
        keywords: 'category categories tag tagging budget groceries stats',
        body: (
          <>
            <p>
              Every group starts with a small set of categories already set up — Groceries,
              Eating out, Household, Bills & utilities, Transport, Health, Other — add, rename, or
              delete your own from Group Settings any time.
            </p>
            <p>
              Tagging a bill's <strong>Category</strong> (right next to "Paid by") covers the
              whole receipt in one tap — the common case, since most shopping trips are mostly one
              thing. If one specific item genuinely belongs somewhere else (a gift picked up
              during a grocery run), tap the small colored dot on that item to override it just for
              that one line.
            </p>
            <p>
              Group Stats then breaks down spending by category, so you can see not just what you
              spent, but on what.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: 'Settling up',
    sections: [
      {
        id: 'settling-up',
        title: 'Settling up',
        keywords: 'settle up owe balance mark paid record payment delete',
        body: (
          <p>
            Every group page shows a live <strong>Settle up</strong> section — who owes whom,
            already simplified to the fewest payments needed. When money actually changes hands,
            hit <strong>Mark paid</strong> on a suggested payment, or record one manually (handy
            for a partial payment, or one that doesn't match a suggestion). Made a mistake? Any
            payment can be deleted from the history.
          </p>
        ),
      },
    ],
  },
  {
    label: 'Sharing & importing your data',
    sections: [
      {
        id: 'recaps',
        title: 'Recaps: sharing, PDF, and CSV',
        keywords: 'recap share text pdf csv export download print',
        body: (
          <>
            <p>
              Both a single bill and a group's settle-up have a <strong>Share recap</strong>{' '}
              button — tap it for a small menu with the two ways to get it out:
            </p>
            <ul>
              <li>
                <strong>Share as text</strong> — quick, plain text formatted for pasting straight
                into a chat.
              </li>
              <li>
                <strong>Download as PDF</strong> — opens your browser's print dialog; choose
                "Save as PDF."
              </li>
            </ul>
            <p>
              A bill also has a separate <strong>Export CSV</strong> button next to the share
              menu, for a spreadsheet-friendly file (bills only) rather than a human-readable
              recap.
            </p>
          </>
        ),
      },
      {
        id: 'splitwise',
        title: 'Importing from Splitwise',
        keywords: 'splitwise import migrate csv expense net balance',
        body: (
          <>
            <p>
              Already tracking expenses in Splitwise? Export your group from Splitwise as a CSV,
              then use <strong>Import bills from Splitwise</strong> in that group's{' '}
              <strong>Group settings</strong> to bring them in — realistically a one-time thing,
              so it isn't on the group page itself. Each Splitwise expense becomes one bill,
              dated to match the original. You'll be asked to match each Splitwise name to an
              existing member or guest before importing.
            </p>
            <p>
              Splitwise only exports each person's net balance per expense, not each payer's exact
              contribution — so an expense that genuinely had multiple payers in Splitwise imports
              with one payer credited the full amount, flagged with a warning naming that specific
              bill. Go fix that one bill's "Paid by" afterward using Multiple payers, above.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: 'Stats',
    sections: [
      {
        id: 'stats',
        title: 'Stats',
        keywords: 'stats statistics spending week month year category person',
        body: (
          <>
            <p>
              A group's page shows a quick "this week / this month" total near the bottom.{' '}
              <strong>Group stats</strong> (from a group's page) goes further — spending by
              person, by category, by month, and the biggest bills. <strong>Your stats</strong>{' '}
              (account menu) does the same across every group you're in, plus your overall
              balance — including a frozen record for any group you've since left.
            </p>
            <p>
              Both let you switch between week, month, year, and all-time views, and both show a
              "▲/▼ vs last period" badge next to the total and each category when you're looking
              at a week, month, or year (there's no previous period to compare "all time" against).
              On Your Stats specifically, both the top comparison and the category breakdown
              underneath include any group you've since left — the one exception is a group left
              before this app tracked category-level history, whose frozen record only has the
              plain totals, not a category breakdown.
            </p>
            <p>
              A few controls on the week/month/year/all-time selector itself: viewing by month
              adds a ‹‹ / ›› pair that jumps a full year at a time, for checking something from a
              while back without clicking through one period after another. Viewing by week adds
              two extra pairs — ‹‹ / ›› for a month, ‹‹‹ / ››› for a year — since a year-jump
              alone still leaves a lot of clicking to land on the exact week you want. On Your
              Stats, the page opens on whichever period is your saved default
              (a thin outline marks that tab) — browse to a different one and a small "Set ___ as
              default" link appears to change it. Both that and where the "Spending thresholds"
              section sits (top or bottom of the page — a link right in that section switches it)
              are saved only on this device, same as currency and dark mode.
            </p>
          </>
        ),
      },
      {
        id: 'thresholds',
        title: 'Spending thresholds: personal monthly budgets',
        keywords: 'threshold budget limit spending cap groceries monthly',
        body: (
          <>
            <p>
              Set a monthly budget per category from <strong>account menu → Spending
              thresholds</strong> — a personal setting, not a group one, since it's tracking your
              own spending across every group you're in, not any one group's total. There's one
              amount field for each of the seven default categories, plus one for every custom
              category across your groups.
            </p>
            <p>
              <strong>A category with the same name is one and the same budget</strong>, even
              across different groups — "Wine" in one group and "wine" in another (or the same
              name as one of the defaults) share a single threshold rather than getting their own
              separate one. Worth knowing before you're confused about why a category you swear
              you didn't set a budget for already has one.
            </p>
            <p>
              Once set, it shows up as a progress bar on Your Stats — always compared against the
              current calendar month, and always just your own share of what's been spent, not
              anything you've fronted for the rest of the group.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: 'Group management',
    sections: [
      {
        id: 'admin',
        title: 'Group settings and permissions',
        keywords: 'admin permission remove kick leave transfer make owner',
        body: (
          <>
            <p>
              Each group has one <strong>admin</strong> — whoever created it, marked with an
              "(admin)" label in the member list — unless the role's been handed to someone else
              via <strong>Make admin</strong> next to their name. Only the admin can remove
              another real member; anyone can leave a group themselves any time. If the admin
              leaves, the role passes automatically to whoever's been in the group the longest.
            </p>
            <p>
              Guests and categories are different — any active member can add, rename, or remove
              either, since that's managing shared group data rather than removing a person
              against their will.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: 'Your account',
    sections: [
      {
        id: 'account-settings',
        title: 'Currency, dark mode, and other account settings',
        keywords: 'currency dollar euro pound symbol dark mode light theme account menu',
        body: (
          <p>
            The account menu (top right) has a currency picker (which symbol is shown throughout
            the app — a display preference only, not real currency conversion), a dark/light mode
            toggle, and links back to this guide, Your stats, Spending thresholds, and Scan
            settings — all in one place.
          </p>
        ),
      },
    ],
  },
]

function Section({ section, forceOpen }) {
  return (
    <details className="guide-section" open={forceOpen || section.defaultOpen}>
      <summary>{section.title}</summary>
      <div className="guide-section-body">{section.body}</div>
    </details>
  )
}

export default function Guide() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()
  const isSearching = normalizedQuery.length > 0

  const visibleGroups = useMemo(() => {
    if (!isSearching) return GROUPS
    return GROUPS.map((group) => ({
      ...group,
      sections: group.sections.filter((s) =>
        `${s.title} ${s.keywords}`.toLowerCase().includes(normalizedQuery)
      ),
    })).filter((group) => group.sections.length > 0)
  }, [normalizedQuery, isSearching])

  return (
    <div className="page">
      <header className="page-header">
        <button type="button" className="btn-link" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>How to use Spesa</h1>
      </header>

      <div className="receipt-tape guide-search-tape">
        <input
          type="text"
          className="guide-search-input"
          placeholder="Search the guide…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the guide"
        />
      </div>

      {isSearching && visibleGroups.length === 0 && (
        <p className="empty-state">
          Nothing matches "{query}" — try a different word, or clear the search to browse
          everything.
        </p>
      )}

      {visibleGroups.map((group) => (
        <div key={group.label} className="guide-group">
          <h2 className="guide-group-label">{group.label}</h2>
          {group.sections.map((section) => (
            <Section key={section.id} section={section} forceOpen={isSearching} />
          ))}
        </div>
      ))}
    </div>
  )
}
