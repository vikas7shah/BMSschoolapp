# Toll-free number registration — draft for review

Number: **+1 (877) 549-5707** (`phone-b3ed1af8a32a48e5b481a511b58ea3cc`), $2/month.
Registration type: `US_TOLL_FREE_REGISTRATION`. Values confirmed by Vikas 2026-09-12 and entered into AWS as `registration-54212cc8a1c84d83ab4c83e467b9f763` (all 21 fields, screenshot attached). Number associated. **Not yet submitted.**

This is a compliance declaration made in the school's name to US carriers.


## Company

| Field | Value |
|---|---|
| companyName | Burlington Montessori School |
| businessType | `PRIVATE_PROFIT` |
| website | https://burlingtonmontessorischool.org/ |
| address1 | 6 Lexington Street |
| city / state / zip / country | Burlington / MA / 01803 / US |
| taxId | optional — leave blank unless the school prefers to give its EIN |

## Contact — who carriers reach about this number

| Field | Value |
|---|---|
| firstName / lastName | Vikas Shah |
| supportEmail | vikas7shah@gmail.com |
| supportPhoneNumber | +1 617 838 5268 |

## Use case

| Field | Value |
|---|---|
| monthlyMessageVolume | `1,000` (the bracket above the ~400 expected: 62 children × ≤2 parents × ~3 texts a month) |
| useCaseCategory | `EDUCATION` |
| useCaseDetails | Burlington Montessori School's parent app sends two kinds of text: (1) a one-time sign-in code when a parent signs in, and (2) reminders about the snack day a parent has volunteered for — the evening before, a week ahead, and when days still need a volunteer. Every recipient is the parent of an enrolled child who switched texts on inside the app. No marketing, no third parties. |
| optInType | `DIGITAL_FORM` |
| optInDescription | Parents are enrolled by the school office from its contact roster with text messaging OFF. To receive texts a parent signs in to the app (email code), opens the "You" screen and switches on "Text message", which reads: "Yes, text me snack-day reminders at my number. Message and data rates may apply; reply STOP to stop." The number used is the one on file for that parent, shown on the same screen, where they can correct it. Switching it off, or replying STOP, ends texts. Staff cannot switch it on for a parent. |
| optInImage | `docs/opt-in-screenshot.png` — the live "You" screen at phone size |

## Message samples (as the app actually sends them)

1. `123456 is your Burlington Montessori School sign-in code. It expires in 5 minutes.`
2. `Burlington Montessori School: Reminder — you're bringing snacks to Classroom 1 tomorrow (Wed, Oct 15): a dry snack and fruit. Thank you! Reply STOP to opt out.`
3. `Burlington Montessori School: 2 snack days still need a family in Classroom 2, starting Mon, Oct 20. Reply STOP to opt out. Sign up: https://d3ev09ilchw30c.cloudfront.net/snacks`

## After registration is approved

Two things AWS only does by support case, from the console, as the account owner:

1. **Exit the SMS sandbox** — SNS console → Text messaging (SMS) → *Exit SMS sandbox*. Until then texts reach only verified numbers.
2. **Raise the spend limit** from $1/month — same page, *Request spending limit increase*. $10 is plenty.

Then set `smsEnabled: true` in `infra/cdk.json` and redeploy. Sign-in codes go by text to parents who have opted in; everyone else keeps email.
