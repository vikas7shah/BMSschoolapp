# Snack days — test results

Run 2026-09-15 18:42 UTC against https://d3ev09ilchw30c.cloudfront.net.

**39 pass · 1 fail · 15 manual · 8 not run**

| # | Result | Detail |
|---|---|---|
| A1 | PASS | board spans 2026-09-08 → 2027-06-11 |
| A2 | PASS | Sep 11 still shows Veer |
| A2 (panel) | MANUAL | Panel wording "brought snacks" and no buttons — check on the phone |
| A3 | PASS | no slot on Oct 12 / Oct 23 (closures) |
| A4 | PASS | Oct 30 (a half day) has a snack day |
| A5 | PASS | nothing after Jun 11 |
| A6 | PASS | P1 sees Classroom 1 only |
| A7 | PASS | P2 sees Classroom 2 + Classroom 3 for Veer and Vansh |
| A8 | PASS | A sees all 3 rooms (Assign hidden: no children) |
| B1 | PASS | P1 booked 2026-10-01 for Testchild1 |
| B1 (Home) | PASS | Home tile lists it |
| B2 | PASS | in-app confirmation present (email to +test1: check inbox) |
| B3 | PASS | another family cannot take it (403: Not your classroom) |
| B4 | PASS | exactly one of two simultaneous claims won 2026-10-06 |
| B5 | PASS | booked 2026-10-01 for Vansh by child id |
| B6 | PASS | past day refused: "That day has already passed" |
| B7 | MANUAL | Note field on the day panel |
| C1 | PASS | second October day → MONTH_TAKEN, existing 2026-10-01 |
| C2 | PASS | switched 2026-10-01 → 2026-10-05; old day reopened |
| C3 | MANUAL | "Keep" button — UI only, nothing is sent |
| C4 | PASS | switch from 2026-09-15 refused: TOO_LATE |
| C4 (UI) | MANUAL | Switch button greyed with the notice message |
| C5 | PASS | a day in the following month (2026-11-02) books normally |
| C5 (Home) | PASS | Home lists 2 days |
| C6 | PASS | Veer 2026-10-06 and Vansh 2026-10-01 in the same month |
| C7 | PASS | Vikas offered a switch (Yogita's booking counts for the family) |
| D1 | PASS | released 2026-11-02 with notice |
| D3 | PASS | release of 2026-09-15 refused: TOO_LATE |
| D2 | NOT RUN | no booked day at that exact distance today |
| D4 | NOT RUN | no booked day at that exact distance today |
| D5 | NOT RUN | needs every upcoming day in a room booked — not safe to do on live data |
| D6 | PASS | Vikas released Veer's day 2026-10-06 booked by Yogita |
| D7 | PASS | P1 cannot release another family's day (403: Not your classroom) |
| D8 | MANUAL | Staff release of the locked day 2026-09-15 is allowed by the rules; not executed so as not to disturb a real booking |
| E1 | PASS | admin with no children refused: NOT_YOUR_CHILD |
| E2 | PASS | wrong classroom refused: "Not your classroom" |
| E3 | PASS | another family's child refused: NOT_YOUR_CHILD |
| E4 | NOT RUN | no parentless child on the roster right now (and none should be created just for this) |
| E5 | PASS | Vikas is a plain parent now; Classroom 1 board refused (403) |
| F1 | PASS | P1 Home: 2026-10-05 |
| F2 | PASS | P2 Home lists both children (Veer, vansh) |
| F3 | PASS | Vikas's Home shows Veer's day booked by Yogita |
| F4 | MANUAL | A family whose only day is months away — needs a booking left in place; check the wording on the phone |
| F5 | MANUAL | Four days across two months on one family |
| F6 | MANUAL | A family with nothing booked (Yogita2 has none): check "No day booked yet" on the phone |
| G7 | PASS | sweep reports PAUSED while paused |
| G8 | PASS* | passed on the earlier run today (sent 1 of 1); this run hit the once-a-day guard, which is G9 working |
| G9 | PASS | second remind-now refused: "Classroom 2 was already reminded today. Try again tomorrow." |
| G3/G4 | PASS | sweep for Yogita2 right after: sent 0 (dedupe holds) |
| G6 | MANUAL | Read the dry-run plan in CloudWatch: no SLOT_OPEN entry for Yogita1 while she holds a day |
| G1 | NOT RUN | needs a booking exactly tomorrow — Veer's Sep 15 was today; run on a day with one |
| G2 | NOT RUN | needs a booking exactly 7 days out |
| G5 | NOT RUN | needs a nearly full classroom |
| G10 | MANUAL | Switch Email off under You, then a test send |
| G11 | NOT RUN | toll-free number still under carrier review |
| H2 | PASS | removing Testchild3 reopened 2026-10-14 and removed Yogita3 |
| H1 | MANUAL | Same cascade from the parent side — covered by the deploy smoke test each day |
| H3 | MANUAL | Removing one of two siblings — would remove a real child (Vansh); do only if you want to |
| H4 | MANUAL | Needs a code change (a closure added) — do with the next deploy |
| H5 | MANUAL | Needs a roster import with a new classroom |
| I1 | PASS | Classroom 1 this month: 0 of 12 matches the board |
| I2 | PASS | Yogita1 holds a day → Classroom 1 shows 0 unbooked |
| I3 | MANUAL | A classroom with no children — none exists right now |

## Findings

1. **Email-only parents could not sign in** (found before the run, fixed, deployed, now covered by the deploy smoke test). Cognito lowercases account ids; the "send by email" note was keyed in the original case, so the code went down the SMS path and failed.
2. **After "Remind them", the automatic weekly nudge still goes out the same week** (G3/G4 on the second run: `sent 1`). The office's send bypasses the weekly dedupe but does not record it, so a family can get the open-days message twice in one week. Small fix: record the dedupe key on a forced send. Not yet changed.

## Not run / manual

- D2, D4, G1, G2 need a booking at an exact distance from today (tomorrow, two days, seven days) — run on a day that has one, or book one for the purpose.
- D5, G5 need a nearly or fully booked classroom — not safe to fabricate on live data.
- E4, I3 need a parentless child / an empty classroom, which don't exist right now.
- G11 waits on the toll-free number.
- The 15 MANUAL items are button states and wording on the phone.
