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
        keywords: 'group household trip create join invite qr code share link create a new group pagination',
        defaultOpen: true,
        body: (
          <>
            <p>
              A <strong>group</strong> is a household, trip, or any set of people who share
              expenses. The groups list comes first on that page — <strong>Create a new
              group</strong> is its own section below the list (10 groups per page, with a page
              selector once you've got more than that), so the list itself is what you see first.
              Or join an existing one via an invite link.
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
        id: 'personal',
        title: 'Personal spending — tracking just your own',
        keywords:
          'personal solo alone just me financial companion budget my own spending bank statement import transactions recurring duplicate excel xlsx csv chatgpt claude gemini prompt copy paste api key',
        body: (
          <>
            <p>
              The <strong>Personal</strong> tab on the groups list opens a space that's just
              yours — created automatically the first time you open it, no setup needed.
              Categories, thresholds, receipt scanning, recurring bills, stats, and CSV export
              all work exactly like a normal group; the only thing missing is anything about
              other people (Invite, "paid by"/"split with" pickers, Settle Up), since there's
              never anyone in it but you.
            </p>
            <p>
              It counts toward <strong>Your Stats</strong> automatically, right alongside your
              real groups.
            </p>
            <p>
              <strong>Group settings → Import a bank statement</strong> turns a bank or
              credit-card statement into bills — a CSV or Excel export from your bank if it
              offers one (matched against a header row locally, no AI required — Excel is there
              for mobile, since redacting a PDF or exporting to CSV is realistically a
              desktop-only step), or a PDF read by whichever AI service you've set up in{' '}
              <strong>Scan settings</strong>. Strip anything sensitive beyond the transactions
              themselves before uploading a PDF — it's sent to that provider to be read. No Claude
              or Gemini key set up here at all? A collapsible section on that same screen holds a
              ready-made prompt to copy into whichever AI chat app you already use (ChatGPT,
              Claude.ai, Gemini) — attach your own redacted statement there and paste the CSV it
              hands back in; the prompt asks for a category guess too, using your group's own
              categories, so it goes straight through the same review flow as an upload. If you do
              have an AI service configured, CSV and Excel imports use it too: it double-checks
              the automatic column match against a few sample rows (only overriding it, with a
              notice to double-check dates and amounts, when the two genuinely disagree) and
              suggests a category for every transaction — the same AI pass PDF imports and{' '}
              <strong>/categorize</strong> already use. Unlike a PDF, which needs AI to read at
              all, CSV/Excel's own column match works standalone — so the double-check specifically
              has its own on/off checkbox right on the import screen, for anyone who'd rather not
              use it (out of API quota, or just doesn't want this file's data going to that
              provider) without losing CSV/Excel import altogether. Review happens one transaction
              at a time rather than a single long list — each card has an editable description
              (tap it to fix up the bank's own wording before it becomes a bill title), a category
              suggestion, and a checkbox before it's saved; a transaction that looks like it's
              already been imported (an overlapping statement period) or already recorded as a
              bill in one of your other groups (a shared expense showing up on your own statement
              too) defaults to unchecked either way — still reviewable, in case either flag is a
              false positive. A <strong>← Back</strong> button is always there to fix an earlier
              card if you catch a mistake. Every transaction becomes a real bill the moment you
              move past its card, not all at once at the end — so closing the tab partway through
              a long statement loses nothing already confirmed; <strong>Group settings</strong>{' '}
              shows "Resume bank statement import" the next time you're ready to finish the rest.
              A charge that repeats on a regular schedule isn't detected automatically here — set
              it up as a Recurring Bill by hand from Group Settings if you'd like it generated
              automatically going forward.
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
        keywords: 'bill item add scan type manual paid by default split pagination page delete select share menu edit rename price quantity unit total borrowed lent owe balance date backdate postdate',
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
              Made a typo, or a scan misread a price? Tap an item's name, price, or quantity to
              edit it right there — it turns into a text box; Enter or tapping away saves, Escape
              backs out. A faint dotted underline marks what's tappable. No need to delete an item
              and re-add it just to fix a mistake. Clearing a box completely and confirming it
              always reverts to what it said before, never saves it blank or as zero.
            </p>
            <p>
              Next to the total, a smaller "$1.29 x 2" shows the unit price and quantity behind
              it — tap either number to change it, and the total follows. At quantity 1 the unit
              price is hidden (it's the same number as the total already shown), but "x 1" stays
              so you can still bump the quantity. Editing the total itself works the other way
              around: quantity stays put and the unit price adjusts to match.
            </p>
            <p>
              <strong>Paid by</strong> controls who fronted the money — usually one person, but
              see <strong>Multiple payers</strong> below if more than one person chipped in.
            </p>
            <p>
              A bill's date — right-aligned, in small type just above the item list — is also
              tap-to-edit, the same as an item's name or price. Most bills happen the same day
              they're added and never need this, which is why it stays out of the way; it's there
              for adding one a few days late without it landing in the wrong week's report, or for
              fixing up a bill by hand (say, after an import missed it). Tapping it opens your
              device's own date picker rather than a text box.
            </p>
            <p>
              A group with a lot of bills shows 15 at a time with a page selector at the bottom,
              newest first — handy after importing a big batch from Splitwise.
            </p>
            <p>
              Each bill's row also shows its total, right next to the name, and underneath it —
              in italics — what that one bill means for you: <strong>"You borrowed …"</strong> in
              red if your share came to more than you fronted, <strong>"You lent …"</strong> in
              green if you fronted more than your share, or <strong>"You are not
              involved"</strong> if you're neither paying nor assigned to anything on it. This is
              just about that one bill, separate from your overall balance with the group further
              down the page.
            </p>
            <p>
              The <strong>⋮</strong> on any bill's row opens <strong>Select</strong>,{' '}
              <strong>Share</strong>, and <strong>Delete</strong> for that one bill. Delete just
              asks you to confirm; Select turns on selection mode with that bill already checked —
              the same place you'd land by tapping the list's own <strong>Select</strong> toggle
              above it and then checking that row yourself, so use whichever one you happen to
              reach for first.
            </p>
            <p>
              With bills selected, a bar above the list shows how many and offers{' '}
              <strong>Share</strong> and <strong>Delete selected</strong>. Share sends them as one
              message — a single bill reads exactly like sharing it from its own page; more than
              one gets a running total added at the end. Delete selected confirms the count first.
              Selection carries across pages, so picking some, paging over, and picking more before
              acting on them together works fine. Selecting literally every bill and deleting them
              is the one exception that needs the group admin, same as the Danger Zone button
              below — anyone can delete a subset, however large.
            </p>
            <p>
              For clearing out a group's entire history in one go instead of selecting hundreds of
              rows, see <strong>Delete all bills</strong> in Group settings.
            </p>
          </>
        ),
      },
      {
        id: 'searching-filtering',
        title: 'Searching and filtering bills',
        keywords: 'search filter tag category amount price range slider match any all',
        body: (
          <>
            <p>
              The search bar above a group's bill list matches a bill's title or note —
              case-insensitive, and a partial word is enough, same as searching this guide itself.
              <strong> Filters</strong> next to it opens a panel (closed by default) with two more
              ways to narrow the list, which combine with the search and with each other.
            </p>
            <p>
              <strong>Tags</strong> — pick one or more categories to show only bills with an item
              tagged that way (an item without its own tag counts as its bill's tag, or
              "Uncategorized" if neither has one). With more than one tag picked,{' '}
              <strong>Match any</strong> shows bills with at least one of them; <strong>Match
              all</strong> shows only bills that have every picked tag somewhere in them.
            </p>
            <p>
              <strong>Amount</strong> — a two-handle slider bounded by the group's actual cheapest
              and priciest bill; drag either end to narrow the list to bills in that price range.
              Or tap one of the two numbers below the slider to type an exact amount instead — same
              tap-to-edit as an item's name or price.
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
                API key, set up once in <strong>Settings → Scan settings</strong> (account menu,
                top right).
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
              menu, for a spreadsheet-friendly file rather than a human-readable recap. A group's
              settle-up recap has the same button for its own CSV export — one row per item
              across every bill in the group, with the date, bill, category, and who paid, so it
              can be opened in a spreadsheet or backed up outside the app.
            </p>
          </>
        ),
      },
      {
        id: 'splitwise',
        title: 'Importing from Splitwise',
        keywords: 'splitwise import migrate csv expense net balance review multiple payers proof check total balance',
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
              contribution. That's enough to reconstruct the overwhelming majority of expenses
              automatically, but not a personal expense someone logged purely for their own
              tracking (nets out to exactly 0, indistinguishable from "not involved"), or a real
              multiple-payer expense (Splitwise doesn't say how much each payer put in). Anything
              like that gets its own quick review step right after matching people — one expense
              at a time, pick who paid and who it's split with — rather than being silently
              guessed at or dropped. <strong>Skip for now</strong> is always there if you'd rather
              come back to one later; either way it's tagged in the bill's own note, so the
              group's search always finds it again.
            </p>
            <p>
              If Splitwise's export includes its own trailing balance summary, the import finishes
              with a quick proof-check: a green confirmation if this app's own math lands on the
              same balance Splitwise had for everyone, or a red one listing exactly whose doesn't
              match and by how much. Either way you can continue — it's there to help you spot a
              problem, not to block you.
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
        keywords: 'stats statistics spending week month year category person loading history incomplete',
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
              alone still leaves a lot of clicking to land on the exact week you want. Every stats
              page — Your Stats and every group's own — opens on whichever period is your saved
              default (a thin outline marks that tab) — browse to a different one and a small "Set
              ___ as default" link appears to change it. It's one shared default, not a separate
              one per page: change it from a group's Stats page and Your Stats opens on it too,
              and the other way around. That, and where the "Spending thresholds" section sits on
              Your Stats (top or bottom of the page — a link right in that section switches it),
              are both saved only on this device, same as currency and dark mode.
            </p>
            <p>
              On a group with a lot of history, both stats pages load the last year or two first so
              they open quickly, then keep loading further back in the background — you'll only
              notice if you jump to "All time" or page back further than that before it's finished,
              in which case a small note says the numbers may still be incomplete until it catches
              up.
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
              Set a monthly budget per category from <strong>account menu → Settings → Spending
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
        keywords: 'admin permission remove kick leave transfer make owner delete all bills danger zone',
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
            <p>
              <strong>Danger zone</strong>, at the bottom, has <strong>Delete all bills</strong> —
              every bill in the group at once, items and payer splits included, with a checkbox
              to also clear the group's settle-up (payment) history if you want a true fresh
              start rather than just clearing the bills. Members and categories are untouched
              either way. This is the one bill-deleting action only the admin can do — everyone
              else sees why instead of the button. Since it can erase a group's entire history in
              one click, it doesn't take a plain "are you sure" either: you have to type the
              group's exact name before the confirm button even enables.
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
        title: 'Your name, currency, dark mode, and other account settings',
        keywords:
          'currency dollar euro pound symbol dark mode light theme account menu settings username display name rename',
        body: (
          <>
            <p>
              The account menu (top right) keeps this guide, Your stats, <strong>Settings</strong>,
              About, and signing out — everything else account-level lives on the Settings page
              itself now, one tap in: your own display name (shown to everyone in every group
              you're part of — change it any time), a currency picker (which symbol is shown
              throughout the app — a display preference only, not real currency conversion), a
              dark mode switch, and — collapsed until you actually want them, since both are long
              — Spending thresholds and Scan settings.
            </p>
            <p>
              Spending thresholds and Scan settings also still work as their own direct links from
              wherever else the app already points at them (Your Stats' own thresholds section,
              wherever a scan strategy is shown) — Settings collecting everything in one place
              doesn't take that away.
            </p>
          </>
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
