# Snack days — test plan

Everything else in the app is information; snack days are where rules meet real
families. This plan covers every rule the app enforces, from three seats:

| Seat | Account | Why |
|---|---|---|
| **P1** | Yogita1 Test — Testchild1, Classroom 1 | one child, one classroom |
| **P2** | Yogita (real) — Veer in Classroom 3, Vansh in Classroom 2 | two children, two classrooms |
| **P2b** | Vikas — also Veer's parent, and an admin | the other parent of the same child; staff |
| **A** | Admin (code sign-in) — no children | staff with no family |

Dates below assume today is mid-September 2026; shift them if the month has
turned. "Locked" means inside the 2-day notice window.

---

## A. Seeing the calendar

| # | Scenario | Steps | Expected |
|---|---|---|---|
| A1 | The whole year is there | P1 → Snacks, page back and forward | Months run September 2026 → June 2027 and no further; arrows grey out at the ends |
| A2 | Past days keep their history | P1 → September, tap the 11th | Veer's name on the cell (greyed); panel says "Veer's family brought snacks"; no Assign or release button |
| A3 | Closures are not snack days | P1 → October, look at the 12th and 23rd | "Closed" cell, panel names the reason; nothing to tap |
| A4 | Half days still need snack | P1 → a half day (see Calendar tab) | The cell is a normal open day |
| A5 | Outside the year | P1 → June 2027, days after the 11th | Greyed, panel says "School year over" |
| A6 | A parent sees only their rooms | P1 → classroom picker | Classroom 1 only, no picker for other rooms |
| A7 | Two children, two rooms | P2 → Snacks | A tab per child (Veer / Vansh); each shows that child's classroom |
| A8 | Staff see every room | A → Snacks | Classroom picker with all three rooms; no Assign button on any day |

## B. Taking a day

| # | Scenario | Steps | Expected |
|---|---|---|---|
| B1 | First booking | P1 → an open October day → Assign this day to me | Cell turns green with "Testchild1"; panel says "You're bringing snacks for Testchild1"; Home tile shows the day |
| B2 | Confirmation arrives | after B1 | Confirmation email sent (to the SES simulator, so nobody receives it); in-app message under You |
| B3 | Someone else's day | P1 → a day already taken by another family | Panel names the child; no Assign button |
| B4 | Two families, same second | P1 and P2 both tap Assign on the same open day (two devices) | One gets it; the other sees "Another family just took that slot" and the board refreshes |
| B5 | Which child? | P2 → Vansh tab → open day → Assign | Books for Vansh (the tab decides); cell shows "Vansh" |
| B6 | Past day | P1 → any day before today | No Assign button; API refuses if forced |
| B7 | A note with the booking | (if the panel offers a note) type one and assign | Note saved; visible on the day panel |

## C. One day a month, per child

| # | Scenario | Steps | Expected |
|---|---|---|---|
| C1 | Second day, same month | P1 has Oct 6 → taps Oct 20 | Panel: "Testchild1 already has Oct 6 this month" with **Switch to Oct 20** / **Keep Oct 6** |
| C2 | Switch | C1 → Switch to Oct 20 | Oct 20 is Testchild1's; Oct 6 reopens; one confirmation for the new day |
| C3 | Keep | C1 → Keep Oct 6 | Nothing changes |
| C4 | Switch inside the window | P1 has a day tomorrow → taps another day this month | Panel says "Snack days can't be changed within 2 days of the date…"; **Switch** is greyed out |
| C5 | Different month | P1 has Oct 6 → books Nov 3 | Books normally; two days on the Home tile (this month + next) |
| C6 | Two children, same month | P2 books Oct 6 for Veer and Oct 7 for Vansh | Both allowed — the limit is per child |
| C7 | Other parent's booking counts | P2b (Vikas) taps a second October day for Veer, whom Yogita booked | Switch offer appears — the family already has a day |

## D. Giving a day back

| # | Scenario | Steps | Expected |
|---|---|---|---|
| D1 | Plenty of notice | P1 → own day ≥ 3 days out → "I can't do this day" | Day reopens; cell shows Open; Home tile updates |
| D2 | Locked: the day before | P1 → own day tomorrow | No release button; panel shows the 2-day notice message |
| D3 | Locked: the day itself | P1 → own day today | Same as D2 |
| D4 | Exactly 2 days out | P1 → own day two days from now | Locked (the boundary counts as inside) |
| D5 | Calendar full | Fill every upcoming day in Classroom 1, then P1 tries to release | Refused with the "every snack day is taken" message; staff can still release |
| D6 | Other parent releases | P2b → Veer's day booked by Yogita → release (with notice) | Allowed — it's the family's day |
| D7 | Not your day | P1 forces a release on another family's day (API) | 403 "That slot belongs to another family" |
| D8 | Staff override | A → any family's day tomorrow → release | Allowed (staff are exempt from the notice) |

## E. Who may book for whom

| # | Scenario | Steps | Expected |
|---|---|---|---|
| E1 | Staff with no children | A → any open day | No Assign button; API returns NOT_YOUR_CHILD |
| E2 | Wrong classroom | P1 (Classroom 1) tries a Classroom 2 day (API) | 403 "Not your classroom" |
| E3 | Another family's child | P1 sends a claim naming Testchild2's id (API) | 403 NOT_YOUR_CHILD |
| E4 | Child with no parent | Admin → Families → a child with "No parent linked" | Nobody can book for them; the day stays open |
| E5 | Admin who is also a parent | P2b → Classroom 3 → open day | Can book for Veer only; the Classroom 1 and 2 boards show no Assign button |

## F. Home tile

| # | Scenario | Steps | Expected |
|---|---|---|---|
| F1 | One child | P1 with Oct 6 → Home | One row: Testchild1 · date · Classroom 1 |
| F2 | Two children | P2 with Veer Sep 15 and Vansh Oct 6 → Home | Two rows, soonest first and lifted |
| F3 | Both parents see it | P2b → Home | Veer's day, booked by Yogita, is on Vikas's tile too |
| F4 | Later in the year | P1 books Jan 12 only → Home | "Nothing this month or next … later in the year"; a "See the calendar" button |
| F5 | More than three | a family with 4 days in two months | Three rows and "+1 more" |
| F6 | Nothing booked | new family → Home | "No day booked yet" with **Find a day** |

## G. Reminders

Use the admin "Remind them" and the test send (`--only`) so nothing waits for 5 pm.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| G1 | Two days before | P1 has a day in 2 days; run the sweep | "Snack day coming up…" email asking whether a reminder tomorrow would help; the app link opens that day |
| G2 | Remind me tomorrow | P1 opens that day and taps Remind me tomorrow; the next day, run the sweep | "Tomorrow: you're bringing snacks…" email. Without the tap, nothing the day before |
| G3 | Not twice | run the sweep again | Nothing sent (dedupe) |
| G4 | 1st of the month | On the 1st, P1 has nothing booked that month; run the sweep | "Pick your October snack day" to P1; nothing to families who already have a day |
| G5 | 8th, once | On the 8th, P1 still has nothing; run the sweep. Run again on the 9th | One follow-up on the 8th; nothing on the 9th or any other day |
| G6 | Pause over the 1st | Pause on the 30th, resume on the 3rd; run the sweep | Nothing is made up — the office uses Remind them instead |
| G7 | Pause switch | Admin → Set-up → Pause; run the sweep; P1 books a day | "PAUSED", nothing sent; no booking confirmation and nothing in Messages; sign-in codes still arrive |
| G8 | Remind now | Admin → Home → Classroom 1 → Remind them | Sign-up email to every unbooked family in Classroom 1 only — even while paused |
| G9 | Remind now guard | tap Remind them again the same day | "Reminded today" — refused |
| G10 | Channel choice | P1 switches Email off under You; run the sweep | No email; the in-app message still appears |
| G11 | Text (once SMS is on) | P1 switches Text on; run the sweep | SMS to +test1's number with the STOP line; email too if still on |

## H. Staff changes that touch bookings

| # | Scenario | Steps | Expected |
|---|---|---|---|
| H1 | Remove a parent with a day | Admin removes Yogita1 (who has Oct 6) | Oct 6 reopens; Testchild1 removed (no other parent); result names both |
| H2 | Remove a child with a day | Admin removes Testchild2 (Yogita2's only child, has a day) | Day reopens; Yogita2 removed too |
| H3 | Remove one sibling | Admin removes Vansh | Vansh's days reopen; Yogita and Vikas stay (Veer remains) |
| H4 | A day becomes a holiday | Add a closure in `SCHOOL_EVENTS` on an open day, deploy | The open day disappears within the hour; a *booked* day on that date is left alone |
| H5 | New classroom | Import a roster with "Classroom 4" | Its snack days exist within the hour, Sep 8 → Jun 11 |

## I. Coverage dashboard (admin)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| I1 | Counts match the calendar | Compare "N of M filled" for September against the September board | Same numbers |
| I2 | Unbooked count | Book a day for Yogita1 | Classroom 1's "families have nothing booked" drops by one |
| I3 | Empty room | Classroom with no children | "No families in this classroom yet", no Remind button |

---

**Not in scope here:** sign-in, roster import, newsletter, calendar page, install — static or already covered by the deploy smoke test.
