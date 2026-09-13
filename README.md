# Snack Days — Burlington Montessori School

Replaces the snack-day whiteboard with an app parents can use from their phone,
and — the part the whiteboard could never do — reminds them.

**Live:** https://d3ev09ilchw30c.cloudfront.net
**AWS account:** 778715730128 · **Region:** us-east-1 · **Stack:** `Bms-prod`

---

## Setting up

Already done for this deployment — the school record (Burlington Montessori
School, America/New_York, reminders at 5pm), a `Primary` classroom needing
snacks Monday–Friday, and a staff account for +1 617 838 5268 all exist.

### Adding one child by hand

Admin → Families → **Add a child**. The child is the unique thing; each parent
is looked up by phone or email and *linked* if they are already on the roster,
so a second child for a known family is an ordinary case rather than a "parent
already exists" error. A second parent can be added on the same form, and a
child can be added before any parent's details are known. It sends the same
request as a one-row import, so every rule the importer enforces applies.

### Re-running or adding another school

```bash
npm run setup -- --phone "+1YOURNUMBER" --name "Your Name" --email "you@example.com"
```

Safe to re-run: it updates the school to match `infra/cdk.json` and adds an
email address to an existing account rather than duplicating it. The address is
what lets that person sign in by email as well as by text.

## Signing in

Parents sign in with **either** the mobile number or the email address the
school holds — one field, and the six-digit code goes to whichever they used.

**Email works today. SMS does not yet**, because this account has no SMS
origination identity (see *Turning on SMS*). So sign in with your email address.

If you ever need a code that cannot be delivered, it is still generated and
readable from CloudWatch:

```bash
npm run otp
```

Codes last five minutes and belong to the browser session that asked for one, so
always request it from the app rather than the command line.

Once signed in, go to **Admin → Set-up** to publish snack days, then
**Admin → Families** to add parents.

---

## Importing the family roster

**Admin → Import** takes the spreadsheet the school already keeps. Excel
(`.xlsx`) or CSV, dragged in or chosen from disk.

The file is read **in the browser** — it is never uploaded. Only the families
you approve are sent, as ordinary JSON. Nothing is created until you have seen
exactly what will happen:

1. **Columns are auto-detected** from your headings, and every one can be
   corrected by hand. "Mobile", "Cell", "Contact number" and a dozen other
   spellings all resolve to the same field.
2. **A preview shows each family** tagged *Add*, *Skip* (already on the roster)
   or *Fix*, with the reason. Rows that cannot be read at all are listed
   separately, by the row number Excel shows you.
3. **Import** creates the families, in chunks, with a progress bar. Every family
   is independent: one bad row never rolls back the rest, and the result names
   anything that failed.

### Two layouts

The importer detects which shape your sheet is in and says so; you can override
it if it guesses wrong.

**Grouped by child** — one row per child, parents on the rows beneath, and the
classroom given by a heading row above each section. This is what
*BMS Parent Contacts* uses:

```
Classroom 1
Name             Parent Name    Phone Number    Email Address
Amelia Garcia
Bo O'Neill       Ben O'Neill    617-555-0102    ben@example.com
                 Cara O'Neill   617-555-0103    cara@example.com
```

A blank name column means "same child as above", so Bo gets both guardians. The
heading rows become classrooms, which the importer offers to create. Children
listed with no usable contact — like Amelia — are still added to the class list,
without a guardian, so nobody is lost.

**One row per parent** — flat, with a classroom column:

| First Name | Last Name | Mobile | Email | Child First Name | Child Last Name | Classroom |
|---|---|---|---|---|---|---|
| Ana | García | (617) 555-0101 | ana@example.com | Amelia | García | Primary |
| Ana | García | (617) 555-0101 | ana@example.com | Mateo | García | Primary |
| Ben | O'Neill | (617) 555-0102 | | Bo | O'Neill | Primary |

Only the parent name and mobile number are required; **Download a template** on
the Import tab gives you this exact shape. Things it handles that a naive
importer would not:

- **Repeated parents merge.** Two rows sharing a mobile number are one family
  with two children, not two families.
- **Two guardians share one child.** Ben and Cara both listing "Bo" produces a
  single child record with two guardians — not duplicate children.
- **Phone numbers typed as numbers.** Excel stores an unformatted phone as a
  number and writes it to the file in scientific notation
  (`<v>9.782230218E9</v>`). Numeric cells are rendered back to plain digits — a
  real roster hit this on 40% of its numbers, and left alone every one of them
  would have normalised to a different, plausible-looking phone number.
- **Section headings above the column titles.** The first classroom heading
  usually sits on row 1, above the header row, so headings are recognised before
  the header cut-off rather than after it.
- **Children whose parents cannot be imported.** If every listed contact for a
  child is unusable, the child is still created without a guardian rather than
  disappearing along with the contacts.
- **One parent under two siblings.** Merged into a single account with children
  in both classrooms — including when that parent has no phone, so they appear
  in the "cannot add" list once rather than twice.
- **Re-running is safe.** Anyone already on the roster is skipped, so you can
  fix three bad rows and import the same file again.
- **Row numbers match Excel.** Excel omits blank rows from the file entirely, so
  the reader places rows by their real index — otherwise every "row 8" message
  after a blank line would point at the wrong line.

A contact needs **either** a phone number or an email address, not both. Cells
holding more than one value keep the first as primary and record the rest. Two
people sharing one number ("Lee & Jenny Chen") are one contact, named as
written, because that is what the school actually holds. A row with contact
details but no name is attributed to the child's family.

An address already on the roster means the **same person** — usually a parent
who is also staff — so they are linked to the child rather than skipped.

Parents the importer cannot create an account for — no mobile number, two names
in one cell, a cell holding two phone numbers — are listed separately with their
row numbers rather than guessed at. The rest of the roster still imports.

Reading `.xlsx` is done in about 200 lines against the browser's own
`DecompressionStream`, rather than with SheetJS: the maintained SheetJS build is
not published to npm, and the npm copy carries an unpatched prototype-pollution
advisory. Anything the reader cannot open says so and suggests saving as CSV.

## Sign-in while SMS is off

`smsEnabled` in `infra/cdk.json` is **false**, and that is deliberate. With no
origination identity, AWS *accepts* every SNS publish and silently drops it —
no error, no metric, nothing in the logs. Left alone, the app would tell a
parent a code was on its way and none would ever arrive.

While the flag is false, a phone sign-in delivers the code **by email** instead,
and the screen shows where it went (`v•••@gmail.com`). A family with no email on
file is told plainly to ask the office, rather than being left waiting.

Flip `smsEnabled` to `true` and redeploy once a toll-free number is live.

Because an email address is what lets a family sign in, two things follow:

- A parent can see and correct **their own** address on the **You** screen. It
  is always visible now, not hidden behind the reminder-email toggle — the
  roster import is faithful to the school's spreadsheet, and where that sheet
  paired someone with a partner's address, the parent needs to be able to fix
  it themselves.
- Admin → **Families → Contacts** shows anyone missing an address in red and
  lets the office add one inline; those families are listed first.

An address already used by another family is refused, in both places.

## Turning on SMS

As deployed, this account **cannot send any text at all**. Not a sandbox
restriction — there is simply nothing to send *from*:

```
origination identities   none (no phone number, no sender ID, no pool)
account tier             SANDBOX
SMS spend limit          $1/month, and MaxLimit is also $1
```

AWS rejects every send with `No origination entities available to send`. Fixing
it, in order:

| Step | Why | Where |
|---|---|---|
| **1. Get an origination identity** | Nothing sends without one. A **toll-free number** (~$2/month) is the usual choice for a school; 10DLC is the alternative. | AWS End User Messaging → Phone numbers → Request originator |
| **2. Toll-free verification** | Carriers require it before a TFN can send to the public. Free, a form about who you are and what you'll send. Usually a few business days. | Same console → Toll-free registrations |
| **3. Leave the sandbox** | While in sandbox, only destination numbers you have verified receive texts. Note the $1 spend limit **cannot be raised until you leave** — `MaxLimit` is $1. | Support case → *Service limit increase → Pinpoint SMS* |
| **4. Flip the switch** | `smsEnabled: true` in `infra/cdk.json`, redeploy. Sign-in codes then go by text to parents who opted in; everyone else keeps email. | `npm run deploy` |

Where this stands: toll-free **+1 (877) 549-5707** is requested (step 1) and
its registration is submitted and under carrier review (step 2). The
registration is in the AWS End User Messaging console; it is not in this
repository because it carries the school's tax ID and street address.

Parents start with texts **off**. Carriers require the recipient's own consent,
so the only way a number gets a text is the parent switching on *Text message*
on the **You** screen, which states the terms. Every reminder text ends with
"Reply STOP to opt out"; AWS honours STOP on its own.

Once step 1 lands you can verify individual numbers for testing:

```bash
npm run sms-sandbox -- --phone "+1YOURNUMBER"
```

```bash
npm run sms-sandbox -- --phone "+1YOURNUMBER" --code 123456
```

```bash
npm run sms-sandbox -- --list
```

### Why codes land in spam, and the fix

Mail is currently sent *from* a gmail.com address through Amazon SES. SES
cannot DKIM-sign for gmail.com, so Gmail receives a message from its own domain
that Google did not send, fails it on SPF and DKIM, and files it as spam. No
wording change fixes that — the sender must be a domain the school controls.

`burlingtonmontessori.org` is already registered in SES and waiting on three
DNS records. Whoever manages the domain adds them; `npm run verify-sender`
prints the exact records and reports when verification completes (usually
within an hour). Then set `fromEmail` in `infra/cdk.json` to an address at
that domain — `snacks@burlingtonmontessori.org`, say — and redeploy.

Until then the mail *is* being sent; it is just being filed away.

### Sign-in tells you when you are not on file

A number or address the school does not hold gets a clear "we don't have that
on file" rather than a generic "a code is on its way". That does let someone
check whether a contact belongs to a roster family. The school chose that
trade: a parent typing an old address should be told, not left waiting.

### Email covers the gap

**SES has production access on this account**, so email needs only a verified
sender — and both sign-in codes and reminders go out over it. The From address
is `fromEmail` in `infra/cdk.json`.

```bash
npm run verify-sender
```

That reports whether the address is verified and starts verification if not.
It is a script rather than part of the CDK stack on purpose: an SES identity is
account-scoped and often already verified for something else, so a stack that
owned it would fail to deploy against an existing one — and would un-verify it
on teardown.

A parent can only sign in by email once the school has an address on file for
them. Add it when inviting them, or they can add it themselves on the **You**
screen after signing in by text.

---

## Installing on a phone

The app is a PWA, but "install" means something different on each platform,
and the app bridges the gap:

| Platform | What happens |
|---|---|
| Desktop Chrome | Install icon in the address bar, automatically |
| Android Chrome | The browser fires an event and expects the *site* to show a button — Chrome's own banner is no longer reliable. Home and You show an **Install** button that opens the native dialog |
| iPhone / iPad Safari | Apple provides **no install prompt at all**. The only route is Share → Add to Home Screen, so the app shows that instruction with Safari's share glyph |

The card disappears once installed, and on Home it can be dismissed. Manifest,
icons and service worker are all served with the right types, so
installability itself was never the problem — only the prompting.

## Staying current on a bookmarked or installed app

Three kinds of thing, three rules, all set at CloudFront so nothing depends on
a phone's guesswork:

| What | Header | Effect |
|---|---|---|
| API responses | `no-store` | Never cached anywhere. Roster and sign-ups are live on every open |
| Pages, service worker, manifest | `no-cache` | Revalidated on every load — a cheap `304` when unchanged, the new version when not. A deploy reaches a phone on its next open |
| `/_next/static/*` | `immutable`, one year | Every filename carries a content hash, so a URL never changes meaning |

The service worker is network-first for pages and never touches `/api/`, so a
cached shell is only ever used offline.

## The snack board

A **snack day is one commitment**: whoever takes a day brings both a dry snack
and fruit for the class that morning. There is one slot per day, not one for
each item.

The **Snack days** tab is a month calendar. Weekends are dropped, so five
columns leave enough width on a phone to show a name in each cell rather than a
coloured dot. Each day shows the **child's** first name — what a whiteboard
would have said — and tapping a day opens it with *Assign this day to me*.

A parent with more than one child picks the **child**, not the classroom —
"Noor | Zara" at the top of the calendar — and the classroom follows. That is
safe because of a school rule the app now enforces: **siblings are never placed
in the same classroom**, twins included. So choosing a child always pins down
exactly one room, and the assign button reads *"Assign this day to me for
Noor"*. A parent with one child sees no selector at all.

The rule is enforced on the roster import (the family is held back with the
reason, for the sheet to be corrected) and on the add-family form, in both
cases against children already on the roster as well as those being added.
Families → Children flags any clash that reaches the database anyway.

Staff have no children of their own, so they choose a classroom and then pick
from its roster — without that, an adult's name would end up on the board. Optional fields are
removed rather than written as NULL, so "no child attached" is never mistaken
for an empty name.

Reminder messages link to `/snacks?date=…`, which opens that day directly.

The admin **Overview** shows one classroom at a time, chosen from a dropdown at
the top. Coverage, **Days needing snacks** and **Unassigned** all reflect that
one room — a term is too many rows to read across three classes at once. Long
day lists start trimmed with a *Show all* toggle. *Unassigned* lists children
rather than account holders, so a child with two guardians appears once.

## What to bring

The school's snack guidance lives at `/what-to-bring` — the fruit and dry-snack
suggestions, how to prepare them, and what is not allowed. It is reachable from
the note under the calendar, from a claimed day, and from the confirmation and
day-before reminder emails, which is the moment a parent is actually shopping.

The page is **readable without signing in**. It holds no personal data, and
bouncing a parent to a login screen when they have followed a link from a
reminder would defeat the purpose.

Content lives in `packages/shared/src/snack-guide.ts` as structured data — items,
preparation guidance and prohibitions are separate fields, so the "please don't
bring" entries can never be rendered as if they were suggestions. Several are
allergy, choking or preservative related, so change the wording only with the
school.

## The school calendar

`packages/shared/src/school-calendar.ts` holds the published school year —
term dates, events and closures. Parents read it at `/calendar` (a tab in the
bottom navigation, and readable without signing in, like the snack guide).

It is not just a display: **`closed: true` is load-bearing.** Publishing snack
days skips every closure and anything outside the school year, and re-running
*Publish days* removes a day that has since become a holiday — but only while
nobody has claimed it. A claimed day is reported back, never silently deleted.

A half day is deliberately *not* a closure: children are in during the morning,
which is when snack is served. Vacation-care days are treated as closed, since
regular classes are not running.

On the snack calendar, a closed weekday shows as **Closed** rather than simply
being blank, and tapping it names the holiday.

## One day a month, per child

A child holds at most one snack day in any calendar month. Taking a second is
not refused — the app asks: *"Noor already has Oct 14 this month. Switch to
Oct 22 instead?"* For a parent the question appears before they tap, because
the board already knows which day their child holds; for staff, or a stale
board, the server answers `MONTH_TAKEN` with the day in question and the app
asks the same thing.

A switch secures the **new** day first and releases the old one only after,
so it can never leave the child with no day. Giving up the old day is still a
release, so the two-days'-notice rule applies to it — a switch is not a way
round the lock. Each day now records the child's id, not just their name, so
the count is exact.

## When a family can change a day

Two locks, both in `packages/shared/src/rules.ts` as one pure function so the
API enforces exactly what the app explains:

| Rule | Effect |
|---|---|
| **Two days' notice** | A day cannot be given up within 2 days of the date. The school needs time to find someone else. |
| **Full calendar** | Once every upcoming day in a classroom is taken, parents can no longer swap out — giving one up would leave a gap nobody can fill. |

Staff bypass both, so the office can always rearrange. When a rule applies, the
day's panel replaces the release button with the reason rather than letting a
parent tap something the server will refuse, and a locked classroom shows a
banner above the calendar.

"Too late" takes precedence over "full", because it is the more specific answer.

Changing `RELEASE_NOTICE_DAYS` changes both the rule and the wording.

## How the reminders work

A Lambda wakes every hour and asks the school's own clock whether it is 5pm in
`America/New_York`. If it is, it plans the day's reminders:

| Reminder | Who gets it | How often |
|---|---|---|
| **You're bringing snacks tomorrow** | The family who signed up | Once, the day before |
| **Coming up next week** | The family who signed up | Once, 7 days before |
| **Days still need a family** | Only parents with nothing booked | Daily if a gap is ≤3 days away, otherwise weekly |
| **You haven't signed up yet** | Parents with no upcoming day at all | Weekly |

Two design decisions worth keeping:

- **Nobody who has already taken a turn is nudged.** Families doing their part
  never get chased, which is what usually makes this kind of app get muted.
- **Every reminder passes through a dedupe table** keyed by parent, date and
  reminder type. A retry, a double-invocation or a redeploy cannot text a parent
  the same thing twice.

Each parent chooses their own channels — text, email, push, in-app — on the
**You** screen. The in-app inbox is always written, so there is a record even
when a text fails.

Run a sweep by hand without sending anything:

```bash
npm run reminders:dry-run
```

---

## Architecture

```
        parents' phones
              │  https
   ┌──────────▼───────────────────────────────┐
   │            CloudFront                    │
   │   /*  → S3 (static PWA)                  │
   │   /api/* → API Gateway → Lambda (Hono)   │   same origin, so the
   └──────────┬───────────────────┬───────────┘   session cookie is
              │                   │               first-party & httpOnly
        ┌─────▼─────┐      ┌──────▼──────┐
        │ DynamoDB  │      │   Cognito   │  phone + 6-digit SMS code
        │ 10 tables │      │ custom auth │  (3 trigger Lambdas)
        └─────▲─────┘      └─────────────┘
              │
   ┌──────────┴───────────┐
   │  reminders Lambda    │ ← EventBridge, hourly
   │  SNS · SES · WebPush │
   └──────────────────────┘
```

**Why these choices**

- **Static export + one Lambda.** The app is authenticated and interactive, so
  server rendering buys nothing. This keeps cold starts to a single function.
- **API on the same domain as the site.** No CORS, and the session lives in an
  httpOnly cookie rather than in `localStorage` where a script could read it.
- **DynamoDB on-demand.** An idle school costs nothing, and the access patterns
  are all key lookups or single-partition ranges.
- **Cognito holds credentials, we hold sessions.** The one-time code never
  touches our database — it lives only inside Cognito's challenge. We issue our
  own short signed session cookie on success.
- **Phone or email, one account.** Cognito is keyed on the phone number; an
  email sign-in resolves to the same user through a sparse `byEmail` index, and
  the API tells the challenge trigger which channel to send on. The destination
  is always read from the roster, never taken from the request, so nobody can
  redirect another family's code.
- **Claiming a slot is a conditional write.** Two parents tapping "I'll bring
  it" at the same moment cannot both win; the loser gets a clear message and a
  refreshed board.

---

## Repository layout

```
packages/shared      Domain types, date maths, message copy, reminder rules
packages/backend     DynamoDB repositories, notification delivery, secrets
services/api         Hono Lambda — auth, snack board, preferences, admin
services/reminders   The hourly sweep
services/auth-triggers  Cognito define/create/verify challenge
apps/web             Next.js PWA (static export), incl. the spreadsheet reader
infra                CDK stack
scripts              setup, otp, sms-sandbox, verify-sender, reminders, icons
```

**Two traps worth knowing about**, both of which shipped and had to be fixed:

- Column headings are matched with a letters-only normaliser, which is right
  for headings but catastrophic for names: `"Classroom 1"` and `"Classroom 2"`
  both reduce to `"classroom"`, and every child was filed into one room. Names
  use `normName`, which keeps digits. Never match a name with `norm`.
- A Cognito user pool's attribute schema is **immutable after creation**. Making
  `phone_number` optional on the live pool failed with `Invalid
  AttributeDataType` and left the stack in `UPDATE_ROLLBACK_FAILED`. It was also
  unnecessary: `AdminCreateUser` does not enforce required attributes, so an
  account can be created without a phone regardless.

**One thing to remember when adding a page:** the CloudFront function in
`infra/lib/bms-stack.ts` holds the list of valid routes, and anything not in it
is served the 404 page. It works this way because CloudFront's own error pages
apply to every behaviour — including `/api/*`, where they would replace the
API's JSON errors with HTML the client cannot parse. Add the new route to that
`ROUTES` array.

The reminder rules live in `packages/shared/src/planner.ts` as a pure function,
so they can be changed and tested without deploying:

```bash
npm test
```

---

## Common tasks

```bash
npm run deploy
```

Builds the shared package and the web app, then deploys the stack. Use
`npm run diff` first to see what would change.

```bash
npm run dev:web
```

Runs the web app locally. It expects an API at `/api`; point it at the deployed
one with a proxy, or work against the live site for API-dependent screens.

---

## Cost

At one school's scale everything except SMS rounds to nothing. The real line
items are **Secrets Manager (~$0.80/month for two secrets)** and **SMS at about
$0.008 per text** — roughly $2–4/month for a school of 60 families on daily
reminders. DynamoDB, Lambda, CloudFront, S3 and Cognito all sit inside the free
tier at this volume.

`retainData` is `true` in `infra/cdk.json`, so `npm run destroy` leaves the
tables, the user pool and the secrets in place. Set it to `false` only if you
mean it.

---

## Monitoring — hear about it before a parent does

Everything that can fail on the way to a parent raises an alarm, and every
alarm goes to one place: the SNS topic **bms-prod-alerts**, subscribed by
`alertEmail` in `infra/cdk.json`. The subscription arrives as a confirmation
email and does nothing until it is clicked.

| Alarm | Fires when |
|---|---|
| `*-errors` (api, reminders, each auth trigger) | any Lambda invocation throws |
| `api-5xx` | the API returns a 5xx |
| `reminders-not-running` | the hourly reminder job has not run for two hours |
| `api-delivery-failed`, `reminder-delivery-failed` | a text, email or push could not be handed to AWS |
| `signin-code-failed-*` | a sign-in code could not be sent |
| `sms-delivery-failed` | a carrier reported a text undeliverable (SNS delivery-status logs) |
| SES events | bounce, complaint, reject, rendering failure or delay on any email, via the `bms-prod` configuration set |

One deliberate gap: an alarm on *sent-but-not-received* is impossible — carriers
and mail providers only report what they refuse. The delivery-status logs above
are as close as it gets.

Every resource carries the tag `Project=SnackDays`, and an **AWS Budget** of
`budgetUsd` a month (currently $10, the hosting fee the school pays) emails the
same address at 80% and 100% of forecast. The budget filters on that tag, which
only starts matching once the key is activated for cost allocation — AWS
allows that about a day after the tag first appears on a bill:

```bash
aws ce update-cost-allocation-tags-status --cost-allocation-tags-status TagKey=Project,Status=Active
```

Until then the budget reports $0. It is harmless either way.

---

## What this is built to grow into

The tuition reminders, important dates and curriculum pages you described all
reuse machinery that already exists here: the notification fan-out already
handles four channels with per-parent preferences and guaranteed de-duplication,
and the planner is a pure function that takes "things with dates" and returns
"messages to send". Adding a second kind of dated thing is a new table, a new
message template, and a branch in the planner — not a new system.

Tuition is the one to think about before building: money changes the risk
profile, and the safe version reminds parents what is due and links out to
whatever already takes payment, rather than handling card details itself.
