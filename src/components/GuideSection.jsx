import { useMemo, useState } from 'react'
import {
  GroupsNavIcon,
  ReceiptIcon,
  SettleIcon,
  ShareIcon,
  PieChartIcon,
  SettingsIcon,
  ProfileIcon,
  MenuIcon,
} from './icons'
import SettingsNav from './SettingsNav'

// A small inline glyph dropped into a sentence right where it names a
// real on-screen control (the Stats icon, the Share icon, a bill's ⋮
// menu) — reusing the exact same icons.jsx component the real button
// renders, so this can never quietly drift out of sync with the actual
// UI the way a screenshot would the next time an icon changes.
function Glyph({ Icon }) {
  return <Icon size={14} className="guide-glyph" />
}

// A small, inert mockup of an item's "Split with" avatar row (see
// "Choosing who splits each item") — real .avatar/.avatar-row markup, not
// a screenshot, so it always matches the actual control pixel-for-pixel
// and needs no upkeep of its own. Not a real control: nothing here is
// clickable.
function AvatarDemo() {
  return (
    <div className="avatar-row guide-demo" aria-hidden="true">
      <span className="avatar active">A</span>
      <span className="avatar active">S</span>
      <span className="avatar">J</span>
    </div>
  )
}

// A tiny "before/after" mockup for Settle Up's own simplification — three
// raw debts collapsing to the one payment that has the same net effect.
// Same .balance-positive/.balance-negative classes a real bill row's
// "You lent…"/"You borrowed…" line uses, so the colors already mean what
// they mean everywhere else in the app.
function SettleDemo() {
  return (
    <div className="guide-demo guide-settle-demo" aria-hidden="true">
      <p className="muted guide-demo-label">What actually happened</p>
      <p className="guide-settle-row">
        Alex <span className="balance-negative">owes Sam $10</span>
      </p>
      <p className="guide-settle-row">
        Sam <span className="balance-negative">owes Jo $10</span>
      </p>
      <p className="guide-settle-row">
        Jo <span className="balance-negative">owes Alex $10</span>
      </p>
      <p className="muted guide-demo-label">Settle up shows instead</p>
      <p className="guide-settle-row">
        <span className="balance-positive">Nobody owes anybody — it nets out to zero</span>
      </p>
    </div>
  )
}

// A non-interactive stand-in for a row's real "⋮" button, so a topic that
// says "tap ⋮" can show the actual glyph inline instead of just the
// character — same .row-menu-btn styling the real one uses.
function MenuGlyphDemo() {
  return (
    <button type="button" className="row-menu-btn guide-demo-inline" tabIndex={-1} aria-hidden="true">
      ⋮
    </button>
  )
}

// Each topic carries its own plain-text `keywords` separate from the JSX
// body it renders — searching rendered JSX at runtime would be fragile;
// this way the search has exact, deliberate control over what a query
// like "qr" or "budget" actually matches, independent of the prose
// wording.
const GROUPS = [
  {
    id: 'getting-started',
    label: 'Getting started',
    Icon: GroupsNavIcon,
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
              group</strong> is its own section below it (10 groups per page). Or join an
              existing one via an invite link.
            </p>
            <p>
              <strong>Invite</strong> lives in Group Settings, next to Members — a QR code for
              someone standing next to you, or a <strong>Share invite link</strong> button that
              opens your phone's own share menu (straight into WhatsApp, Messages, wherever), or
              just copies the link if sharing isn't available.
            </p>
          </>
        ),
      },
      {
        id: 'personal',
        title: 'Personal spending — tracking just your own',
        keywords: 'personal solo alone just me financial companion budget my own spending',
        body: (
          <p>
            The <strong>Personal</strong> tab on the groups list opens a space that's just yours —
            created automatically the first time you open it. Categories, budgets, receipt
            scanning, subscriptions, stats, and CSV export all work exactly like a normal group;
            the only thing missing is anything about other people (Invite, "paid by"/"split with",
            Settle Up), since there's never anyone in it but you. It counts toward{' '}
            <strong>Your Stats</strong> automatically, right alongside your real groups.
          </p>
        ),
      },
      {
        id: 'bank-import-basics',
        title: 'Importing a bank statement',
        keywords:
          'bank statement import transactions csv excel xlsx column match header mobile personal',
        body: (
          <>
            <p>
              <strong>Group settings → Data → Import a bank statement</strong> turns a bank or
              credit-card statement into bills, in either group or in your Personal space.
            </p>
            <ul>
              <li>
                A <strong>CSV or Excel</strong> export from your bank, if it offers one — matched
                against its own header row locally, no AI required. Excel is there specifically
                for mobile, since redacting a PDF or exporting to CSV is realistically a
                desktop-only step.
              </li>
              <li>
                A <strong>PDF</strong>, read by whichever AI service you've set up in{' '}
                <strong>Scan settings</strong>. Strip anything sensitive beyond the transactions
                themselves first — it's sent to that provider to be read.
              </li>
            </ul>
            <p>
              No Claude or Gemini key set up at all? A collapsible section on the same screen
              holds a ready-made prompt to copy into whichever AI chat app you already use
              (ChatGPT, Claude.ai, Gemini) — attach your own redacted statement there and paste
              back the CSV it hands you.
            </p>
          </>
        ),
      },
      {
        id: 'bank-import-categorization',
        title: 'Bank import: smarter categorization',
        keywords:
          'bank statement categorization category ai claude gemini chatgpt prompt copy paste api key double check',
        body: (
          <p>
            If you have an AI service configured, both the CSV/Excel and PDF paths use it to
            suggest a category for every transaction — the same pass PDF imports and{' '}
            <strong>/categorize</strong> already use — and, for CSV/Excel specifically, to
            double-check the automatic column match against a few sample rows (only overriding it,
            with a notice to double-check dates and amounts, when the two genuinely disagree).
            Since CSV/Excel's own column match already works standalone without AI, that
            double-check has its own on/off checkbox right on the import screen — for anyone out
            of API quota, or who'd rather not send this file's data to that provider, without
            losing CSV/Excel import altogether. The bring-your-own-chat prompt (see above) asks
            for a category guess too, using your group's own categories, so it round-trips straight
            back in the same way.
          </p>
        ),
      },
      {
        id: 'bank-import-review',
        title: 'Bank import: review, matching categories & resuming',
        keywords:
          'bank statement review match bank categories mapping resume duplicate already imported recurring subscription',
        body: (
          <>
            <p>
              If your bank's own export already tags a transaction with a category, that's trusted
              over a fresh guess — but since a bank's own category names almost never match yours
              (and might be in another language), a one-time <strong>Match bank categories</strong>{' '}
              step comes first, asking you to match each one to a category of yours. That choice is
              remembered, so the same bank's categories only ever need matching once.
            </p>
            <p>
              Review happens one transaction at a time, not a single long list. Each card has an
              editable description (tap it to clean up the bank's own wording before it becomes a
              bill title), a category suggestion, and a checkbox before it's saved — a transaction
              that looks already imported (an overlapping statement period) or already recorded
              elsewhere (a shared expense on your own statement too) defaults to unchecked either
              way, still reviewable in case that flag is wrong. A <strong>← Back</strong> button is
              always there to fix an earlier card.
            </p>
            <p>
              Every transaction becomes a real bill the moment you move past its card, not all at
              once at the end — closing the tab partway through loses nothing already confirmed.{' '}
              <strong>Group settings → Data</strong> shows "Resume bank statement import" next time
              you're ready to finish the rest.
            </p>
            <p>
              A charge that repeats on a schedule isn't detected automatically here — set it up as
              a <strong>Subscription</strong> by hand instead if you'd like it generated going
              forward.
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
              <strong>Group settings → Guests</strong>, add anyone by name — they can be assigned
              to items, front a bill, and owe or be owed money exactly like a real account, with
              no login of their own. One person can run the whole group for a party of guests if
              needed.
            </p>
            <p>
              Removing a guest just archives them — their history stays on old bills, and they can
              be restored any time.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'bills-splitting',
    label: 'Bills & splitting',
    Icon: ReceiptIcon,
    sections: [
      {
        id: 'adding-items',
        title: 'Adding items to a bill',
        keywords:
          'bill item add scan type manual price quantity unit total edit rename math expression calculate',
        body: (
          <>
            <p>
              Inside a group, <strong>Start</strong> a new bill, then add items by typing them in
              or scanning a receipt photo (see <strong>Scanning a receipt</strong> below).
            </p>
            <p>
              Each item sits on the receipt as one line — name and total, nothing else — until you
              tap it open. Expanded, its name, unit price, quantity, and total are all tap-to-edit,
              same dotted-underline convention as everywhere else in the app: Enter or tapping away
              saves, Escape backs out, and clearing a box completely and confirming it always
              reverts to what it said before rather than saving blank or zero.
            </p>
            <p>
              <strong>The price fields also do quick math</strong> — type <code>2,30-1,25</code>{' '}
              and it saves as <code>1,05</code>. Handy for splitting a shared line total or
              subtracting a discount by hand without reaching for a calculator first.
            </p>
            <p>
              To remove an item, either expand it and tap <strong>Remove item</strong>, or swipe it
              left to reveal the same thing without opening it at all — whichever's faster in the
              moment, both do exactly the same thing.
            </p>
          </>
        ),
      },
      {
        id: 'splitting-items',
        title: 'Choosing who splits each item',
        keywords: 'split with avatar chip include exclude default new items',
        body: (
          <>
            <p>
              Expand an item and its <strong>Split with</strong> row shows everyone as a small
              initialed circle — tap one to include or exclude that person from that specific
              item's split:
            </p>
            <AvatarDemo />
            <p>
              New items default to splitting with everyone currently in the group, unless you've
              changed <strong>Split with</strong> under the bill's own summary line near the top —
              handy when only some of the group actually did that particular shop.
            </p>
          </>
        ),
      },
      {
        id: 'paid-by-and-date',
        title: "Paid by & the bill's date",
        keywords: 'paid by front money date backdate postdate calendar picker summary details',
        body: (
          <>
            <p>
              A bill's details — note, paid by, category, default split, and date — collapse into
              one line under the title ("Paid by You · Groceries · Sep 10") rather than sitting
              open on every visit; tap it to expand all five.
            </p>
            <p>
              <strong>Paid by</strong> controls who fronted the money — usually one person, but
              see <strong>Multiple payers</strong> below if more than one person chipped in.
            </p>
            <p>
              <strong>Date</strong> is tap-to-edit too, opening your device's own date picker. Most
              bills happen the same day they're added and never need this; it's there for adding
              one a few days late without it landing in the wrong week's report, or fixing up a
              bill by hand after an import missed it.
            </p>
          </>
        ),
      },
      {
        id: 'managing-bill-list',
        title: 'Managing your bill list',
        keywords:
          'pagination page delete select share menu lent borrowed owe balance bulk select all danger zone press hold long press',
        body: (
          <>
            <p>
              A group with a lot of bills shows 15 at a time, newest first — handy after importing
              a big batch from Splitwise.
            </p>
            <p>
              Each bill's total sits next to its name, with — in italics underneath —{' '}
              <span className="balance-negative">"You borrowed …"</span> if your share came to
              more than you fronted, <span className="balance-positive">"You lent …"</span> if you
              fronted more than your share, or "You are not involved" otherwise. This is just about
              that one bill, separate from your overall group balance further down the page. Turn
              it off everywhere from <strong>Settings → Groups</strong> if you'd rather keep the
              list plainer.
            </p>
            <p>
              The <MenuGlyphDemo /> on any bill opens <strong>Select</strong>, <strong>Share</strong>,
              and <strong>Delete</strong> for that one bill — the same place you'd land tapping the
              list's own <strong>Select</strong> toggle and checking that row yourself. Press and
              hold a bill instead for a faster shortcut straight into select mode with that row
              already checked — a small buzz confirms it triggered.
            </p>
            <p>
              With bills selected, a bar above the list offers <strong>Share</strong> (one message;
              more than one bill adds a running total) and <strong>Delete selected</strong>{' '}
              (confirms the count first). Selection carries across pages. Selecting literally
              every bill and deleting them needs the group admin, same as{' '}
              <strong>Delete all bills</strong> in <strong>Group settings → Danger Zone</strong> —
              anyone can delete a smaller subset.
            </p>
          </>
        ),
      },
      {
        id: 'searching-filtering',
        title: 'Searching and filtering bills',
        keywords: 'search filter tag category amount price range slider match any all sticky',
        body: (
          <>
            <p>
              The search bar above a group's bill list matches a bill's title or note —
              case-insensitive, partial words fine. <strong>Filters</strong> next to it opens a
              panel with two more ways to narrow the list, combining with search and each other:
            </p>
            <ul>
              <li>
                <strong>Tags</strong> — one or more categories; <strong>Match any</strong> shows
                bills with at least one, <strong>Match all</strong> only bills with every one.
              </li>
              <li>
                <strong>Amount</strong> — a two-handle slider bounded by the group's own cheapest
                and priciest bill, or tap either number to type an exact amount.
              </li>
            </ul>
            <p>
              Normally, opening a bill and coming back resets the search box and filters. Turn on{' '}
              <strong>Sticky filters</strong> (<strong>Settings → Groups → Display</strong>) to
              keep them exactly as you left them instead — a real page refresh still clears them
              either way.
            </p>
          </>
        ),
      },
      {
        id: 'scanning',
        title: 'Scanning a receipt',
        keywords: 'scan ocr gemini claude ollama photo camera file pdf text html take choose api key',
        body: (
          <>
            <p>
              <strong>Scan a receipt</strong> offers two entry points: <strong>Take photo</strong>{' '}
              jumps straight to your camera; <strong>Choose file</strong> opens your normal file
              picker instead, and also accepts a receipt saved as a PDF, or a plain-text/HTML
              export (an emailed confirmation, say) — not just a photo.
            </p>
            <p>Three ways to actually read whichever file you give it:</p>
            <ul>
              <li>
                <strong>Free OCR</strong> — no setup, entirely on your phone, images only. Best on
                a clear, well-lit photo.
              </li>
              <li>
                <strong>Google Gemini / Anthropic Claude</strong> — more accurate, reads a PDF or
                text file too, needs your own API key (<strong>Settings → Scan</strong>).
              </li>
              <li>
                <strong>A local Ollama model</strong> — private, runs on your own computer, images
                only, also set up in Scan settings.
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
              from the "Paid by" list — check off who contributed and type exactly how much each
              paid.
            </p>
            <p>
              Nothing saves until the amounts add up to <em>exactly</em> the bill's total — a red
              message explains the gap until they do, and Confirm stays disabled. Closing without
              confirming discards whatever you were typing.
            </p>
            <p>
              Adding another item after confirming a split, and changing the total, shows a red
              warning right on the bill until the split is fixed to match again — it still works
              normally in the meantime.
            </p>
          </>
        ),
      },
      {
        id: 'categories',
        title: 'Categories: tracking how you spend, not just how much',
        keywords: 'category categories tag tagging budget groceries stats menu rename delete',
        body: (
          <>
            <p>
              Every group starts with a small set — Groceries, Eating out, Household, Bills &
              utilities, Transport, Health, Other. Add your own from <strong>Group
              Settings → Categories</strong>; each existing one's <MenuGlyphDemo /> menu covers{' '}
              <strong>Rename</strong> and <strong>Delete</strong>.
            </p>
            <p>
              Tagging a bill's <strong>Category</strong> (next to "Paid by") covers the whole
              receipt in one tap — the common case. If one item genuinely belongs somewhere else
              (a gift picked up during a grocery run), tap the small colored dot on that item to
              override it just for that line.
            </p>
            <p>
              <Glyph Icon={PieChartIcon} /> Group Stats then breaks down spending by category, so
              you see not just what you spent, but on what.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'settling-up',
    label: 'Settling up',
    Icon: SettleIcon,
    sections: [
      {
        id: 'settling-up',
        title: 'Settling up',
        keywords: 'settle up owe balance mark paid record payment delete simplify',
        defaultOpen: true,
        body: (
          <>
            <p>
              Every group page shows a live <strong>Settle up</strong> section — who owes whom,
              already simplified to the fewest payments needed:
            </p>
            <SettleDemo />
            <p>
              When money actually changes hands, hit <strong>Mark paid</strong> on a suggested
              payment, or record one manually (handy for a partial payment, or one that doesn't
              match a suggestion). Made a mistake? Any payment can be deleted from the history.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'sharing-importing',
    label: 'Sharing & importing your data',
    Icon: ShareIcon,
    sections: [
      {
        id: 'recaps',
        title: 'Recaps: sharing, PDF, and CSV',
        keywords: 'recap share text pdf csv export download print',
        body: (
          <>
            <p>
              <Glyph Icon={ShareIcon} /> A single bill, and a group's own page (next to Stats and
              Settings), each have a <strong>Share</strong> button with every way to get that data
              out. Your Personal space works the same way, with a total-spent + by-category recap
              instead of who owes whom.
            </p>
            <ul>
              <li>
                <strong>Share as text</strong> — plain text formatted for pasting into a chat.
              </li>
              <li>
                <strong>Download as PDF</strong> — your browser's print dialog; choose "Save as
                PDF."
              </li>
              <li>
                <strong>Export as CSV</strong> — one row per item (a bill), or per item across
                every bill (a group), with date/bill/category/payer, for a spreadsheet or backup.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: 'splitwise-import',
        title: 'Importing from Splitwise',
        keywords: 'splitwise import migrate csv expense net balance match member guest',
        body: (
          <p>
            Already tracking expenses in Splitwise? Export your group from Splitwise as a CSV,
            then use <strong>Import bills from Splitwise</strong> in that group's{' '}
            <strong>Group settings → Data</strong> — realistically a one-time thing, so it isn't on
            the group page itself. Each Splitwise expense becomes one bill, dated to match the
            original, after matching each Splitwise name to an existing member or guest.
          </p>
        ),
      },
      {
        id: 'splitwise-review',
        title: 'Splitwise: reviewing edge cases & the balance check',
        keywords: 'splitwise review multiple payers proof check total balance skip',
        body: (
          <>
            <p>
              Splitwise only exports each person's net balance per expense, not each payer's exact
              contribution — enough to reconstruct most expenses automatically, but not a personal
              expense logged just for someone's own tracking (nets to exactly 0, indistinguishable
              from "not involved"), or a real multiple-payer expense. Anything like that gets its
              own quick review step right after matching people — one expense at a time, pick who
              paid and who it's split with. <strong>Skip for now</strong> is always there; either
              way it's tagged in the bill's own note, so the group's search always finds it again.
            </p>
            <p>
              If Splitwise's export includes its own trailing balance summary, the import finishes
              with a quick proof-check: green if this app's own math lands on the same balance
              Splitwise had for everyone, or red listing exactly whose doesn't match and by how
              much. Either way you can continue — it's there to help you spot a problem, not to
              block you.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'stats',
    label: 'Stats',
    Icon: PieChartIcon,
    sections: [
      {
        id: 'stats',
        title: 'Stats',
        keywords: 'stats statistics spending week month year category person loading history incomplete',
        body: (
          <>
            <p>
              A group's page shows a quick "this week / this month" total near the bottom.{' '}
              <Glyph Icon={PieChartIcon} /> <strong>Group stats</strong> goes further — spending by
              person, by category, by month, and the biggest bills. <strong>Your stats</strong>{' '}
              does the same across every group you're in, plus your overall balance, including a
              frozen record for any group you've since left.
            </p>
            <p>
              Both switch between week/month/year/all-time, and show a "▲/▼ vs last period" badge
              (except on "all time," which has nothing to compare against). Your Stats' own
              comparison and category breakdown include any group you've left too — the one
              exception is a group left before this app tracked category history, whose frozen
              record only has plain totals.
            </p>
            <p>
              Viewing by month adds a ‹‹/›› pair that jumps a full year; viewing by week adds two
              more pairs (a month-jump and a year-jump), since a year-jump alone still leaves a lot
              of clicking to land on one exact week. Every stats page opens on your saved default
              period (<strong>Settings → Profile</strong>) — one shared default, not per page.
            </p>
            <p>
              On a group with a lot of history, both pages load the last year or two first so they
              open quickly, then keep loading further back in the background — a small note appears
              if you jump further than that before it's finished.
            </p>
          </>
        ),
      },
      {
        id: 'thresholds',
        title: 'Budgets: personal monthly spending limits',
        keywords: 'threshold budget limit spending cap groceries monthly',
        body: (
          <>
            <p>
              Set a monthly budget per category from <strong>Settings → Budgets</strong> — a
              personal setting, tracking your own spending across every group you're in, not any
              one group's total.
            </p>
            <p>
              <strong>A category with the same name is one shared budget</strong>, even across
              different groups — "Wine" in one group and "wine" (or the same name as a default) in
              another share a single budget rather than two separate ones.
            </p>
            <p>
              Once set, it shows as a progress bar on Your Stats — always the current calendar
              month, and always just your own share of what's been spent, not anything you've
              fronted for the rest of the group.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'group-management',
    label: 'Group management',
    Icon: SettingsIcon,
    sections: [
      {
        id: 'group-settings-nav',
        title: "Group Settings: what's where",
        keywords: 'group settings nav tabs general members guests categories subscriptions data danger zone',
        body: (
          <p>
            <Glyph Icon={SettingsIcon} /> Tap the gear on a group's own page for the same side-nav
            layout as the account Settings page: <strong>General</strong> (the group's name);{' '}
            <strong>Members</strong> and <strong>Guests</strong> (real groups only — Personal has
            just you, forever); <strong>Categories</strong>; <strong>Subscriptions</strong> (see
            below); and <strong>Data</strong>, for bringing in history from elsewhere (Splitwise,
            a bank statement, categorizing older bills). <strong>Danger Zone</strong> sits pinned
            at the bottom, split off in warm red — same treatment the account page gives Sign Out.
          </p>
        ),
      },
      {
        id: 'admin-permissions',
        title: 'Admin & permissions',
        keywords: 'admin permission remove kick leave transfer make owner',
        body: (
          <>
            <p>
              Each group has one <strong>admin</strong> — whoever created it, marked "(admin)" in
              the member list — unless handed to someone else via <strong>Make admin</strong> next
              to their name. Only the admin can remove another real member; if the admin leaves,
              the role passes automatically to whoever's been in the group longest.
            </p>
            <p>
              Guests and categories are different — any active member can add, rename, or remove
              either, since that's shared group data, not removing a person against their will.
            </p>
          </>
        ),
      },
      {
        id: 'danger-zone',
        title: 'Danger Zone: leaving or deleting a group',
        keywords: 'danger zone delete all bills delete group leave typed confirm',
        body: (
          <p>
            <strong>Leave group</strong> is there for anyone, any time — a plain "are you sure,"
            same confirm-sheet pattern as Sign Out. The other two are admin-only, and both need you
            to type the group's exact name before the confirm button even enables:{' '}
            <strong>Delete all bills</strong> wipes every bill at once (items and payer splits
            included, with a checkbox to also clear payment history — members and categories stay
            untouched), and <strong>Delete group</strong> goes further still — the group itself,
            gone, along with every member, guest, category, subscription, bill, and payment.
            Neither is offered on your Personal space; it isn't something you leave or delete, it's
            recreated automatically next time you open that tab.
          </p>
        ),
      },
      {
        id: 'subscriptions',
        title: 'Subscriptions: bills on a schedule',
        keywords: 'subscription recurring bill rent template schedule weekly monthly yearly repeat frequency edit pause resume delete',
        body: (
          <>
            <p>
              Set up something that repeats — rent, a subscription, a utility bill — once, from{' '}
              <strong>Group settings → Subscriptions</strong>: a fixed amount, one payer, a fixed
              split, on a weekly/monthly/yearly schedule. Each occurrence lands as an ordinary bill
              the next time anyone opens the group on or after its due date — a group gone quiet
              for a while catches up on everything it missed, in order.
            </p>
            <p>
              The <MenuGlyphDemo /> on any subscription opens <strong>Edit</strong> (title, amount,
              category, payer, split — not frequency or start date, locked in once created, since
              changing them risks throwing off which occurrences already happened),{' '}
              <strong>Pause</strong>/<strong>Resume</strong>, and <strong>Delete</strong> (asks
              whether to also delete every bill it's already generated).
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'your-account',
    label: 'Your account',
    Icon: ProfileIcon,
    sections: [
      {
        id: 'account-settings',
        title: 'The Settings page',
        keywords:
          'currency dollar euro pound symbol dark mode light theme settings username display name rename profile budget threshold scan menu hamburger sign out leave group nav side quick stats lent borrowed sticky filters',
        body: (
          <>
            <p>
              <Glyph Icon={ProfileIcon} /> Tapping your name (top right, anywhere in the app) opens{' '}
              <strong>Settings</strong> — everything account-level, arranged down a side menu:
            </p>
            <ul>
              <li>
                <strong>Profile</strong> — display name, dark mode, currency, saved default period
                for both stats pages.
              </li>
              <li>
                <strong>Groups</strong> — every group you're in, with a way to leave one directly,
                plus display switches covering every group's page at once: Quick stats, each
                bill's "You lent/borrowed" line, and <strong>Sticky filters</strong> (keeps a
                group's search/filters intact after opening a bill and coming back).
              </li>
              <li>
                <strong>Budgets</strong> — a personal monthly limit per category.
              </li>
              <li>
                <strong>Scan</strong> — how receipts get read.
              </li>
              <li>This guide, plus Updates (what's new, check for a newer version) and About.</li>
            </ul>
            <p>
              <strong>Sign Out</strong> sits at the very bottom, apart from the rest — an action,
              not a section, and asks you to confirm first.
            </p>
            <p>
              <Glyph Icon={MenuIcon} /> The menu starts as icons only — tap the menu button at the
              top of the page to expand it with labels. Scan settings also still work as their own
              direct link from wherever else the app already points at it.
            </p>
          </>
        ),
      },
    ],
  },
]

function Topic({ section, forceOpen }) {
  return (
    <details className="guide-section" open={forceOpen || section.defaultOpen}>
      <summary>{section.title}</summary>
      <div className="guide-section-body">{section.body}</div>
    </details>
  )
}

// The actual "How to use" content, pulled out of what used to be Guide.jsx's
// whole page so it can be reused two ways: standalone at /guide (kept for
// any existing deep link or bookmark), and inline inside the Settings page
// for anyone browsing in from there instead — same pattern as
// BudgetsSection.jsx/ScanSettingsSection.jsx/AboutSection.jsx.
//
// Browsing (no search query) is one group's topics at a time, picked via
// `compact`:
// - false (default, the standalone /guide page, which has the full page
//   width to itself) — the same SettingsNav.jsx rail/visual language the
//   account and Group Settings pages already use, so this reads as one
//   more rail page rather than a new pattern of its own.
// - true (Settings.jsx passes this for its own "How to Use" section) — a
//   horizontally scrollable row of chips instead. A second full rail
//   nested inside Settings' own already-narrow content column, on top of
//   Settings' own rail right next to it, measured out to a genuinely
//   cramped content width on a real phone — this avoids stacking two
//   vertical rails for the sake of reusing the exact same component.
//
// Searching bypasses both entirely and flattens every group's matching
// topics into one list, force-opened — exactly what it already did
// before this grouping existed, since a search is answering "where's the
// bit about X," not "let me browse category by category."
export default function GuideSection({ compact = false }) {
  const [query, setQuery] = useState('')
  const [activeGroupId, setActiveGroupId] = useState(GROUPS[0].id)
  const [expanded, setExpanded] = useState(false)

  const normalizedQuery = query.trim().toLowerCase()
  const isSearching = normalizedQuery.length > 0

  const searchResults = useMemo(() => {
    if (!isSearching) return []
    return GROUPS.map((group) => ({
      ...group,
      sections: group.sections.filter((s) =>
        `${s.title} ${s.keywords}`.toLowerCase().includes(normalizedQuery)
      ),
    })).filter((group) => group.sections.length > 0)
  }, [normalizedQuery, isSearching])

  const activeGroup = GROUPS.find((g) => g.id === activeGroupId) || GROUPS[0]

  return (
    <>
      <div className="receipt-tape guide-search-tape">
        <input
          type="text"
          className="guide-search-input"
          placeholder="Search the guide…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the guide"
        />
        {!isSearching && !compact && (
          <button
            type="button"
            className={`icon-btn${expanded ? ' active-toggle' : ''}`}
            onClick={() => setExpanded((e) => !e)}
            aria-label="Toggle guide menu"
            aria-expanded={expanded}
          >
            <MenuIcon size={18} />
          </button>
        )}
      </div>

      {isSearching ? (
        searchResults.length === 0 ? (
          <p className="empty-state">
            Nothing matches "{query}" — try a different word, or clear the search to browse
            everything.
          </p>
        ) : (
          searchResults.map((group) => (
            <div key={group.id} className="guide-group">
              <h2 className="guide-group-label">{group.label}</h2>
              {group.sections.map((section) => (
                <Topic key={section.id} section={section} forceOpen />
              ))}
            </div>
          ))
        )
      ) : compact ? (
        <>
          <div className="guide-group-tabs">
            {GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`guide-group-tab${group.id === activeGroup.id ? ' active' : ''}`}
                onClick={() => setActiveGroupId(group.id)}
              >
                <group.Icon size={15} />
                {group.label}
              </button>
            ))}
          </div>
          {activeGroup.sections.map((section) => (
            <Topic key={section.id} section={section} />
          ))}
        </>
      ) : (
        <div className={`settings-shell${expanded ? ' expanded' : ''}`}>
          <SettingsNav
            sections={GROUPS}
            activeId={activeGroup.id}
            onSelect={(id) => setActiveGroupId(id)}
          />
          <div className="settings-content">
            <h2 className="settings-section-title">{activeGroup.label}</h2>
            {activeGroup.sections.map((section) => (
              <Topic key={section.id} section={section} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
