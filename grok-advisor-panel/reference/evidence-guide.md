# Evidence guide: collecting customer evidence the Customer Voice seat can use

Attach to the Grok project as a knowledge file. Use it when the packet says
`EVIDENCE FLOOR NOT MET`, or before a decision you know will need customer input.

Adapted in part from phuryn/pm-skills `interview-script` and `summarize-interview`
(MIT); see `vendor/phuryn-pm-skills/`.

## The evidence floor (what counts)

At least **5 direct customer sources** relevant to *this* decision, from the
**affected segment**, collected within the **last 12 months**.

| Counts | Doesn't count |
|---|---|
| Recorded or noted interview about past behaviour | "Would you use X?" answers |
| Support ticket tagged with a decision-relevant tag | Inbound demo request with no conversation |
| Win/loss note with the reason in the customer's words | Founder's recollection of a dinner chat |
| Cancellation reason written by the customer | Slack hearsay, "people keep asking" |
| Sales-call transcript excerpt | Survey of a different segment |

Weight is per **customer**, not per comment: 4 tickets from one account = 1 source.

## 20-minute interview script (5 calls is enough to clear the floor)

Rules: ask about the **past**, not the future. Never pitch. Count compliments as noise.
Write down exact words for anything you might quote later.

1. **Context (2 min).** "Tell me about your business: locations, who does the books, how long you've used us."
2. **Last time (6 min).** "Walk me through the last time you [did the job the decision touches, e.g. filed sales tax / ran payroll]. What happened? How long did it take? Who was involved?"
3. **Pain (4 min).** "What was the hardest part?" → "Why?" (ask 2–3 times). "What have you tried to fix it?"
4. **Switching (4 min).** "When did you last seriously look at another way to do this? What triggered it? What stopped you?" *(push, pull, anxiety, habit)*
5. **Money (2 min).** "What do you spend on this today, in money or hours?" Don't ask "would you pay $X?"; ask what they pay now.
6. **Close (2 min).** "What should I have asked?" "Who else should I talk to?"

Afterwards, fill in one line per interview:

```
#<n> | segment | date | job (their words) | trigger | blocker | spend today | verbatim quote (exact) | relevant to option: A/B/C/none
```

## Ticket-tagging method (one afternoon, no new tools)

1. **Pull** the last 90 days of tickets for the affected segment (export to CSV).
2. **Set up 5–8 tags before reading**, built from the decision. For a pricing change: `price-complaint`, `value-question`, `feature-gap:<name>`, `multi-location`, `cancel-intent`, `other`. Keep `other` honest.
3. **Tag a random 100** (or all of them if fewer). One primary tag per ticket. Copy the customer's sentence word for word into a `quote` column.
4. **Dedupe by account.** Count accounts, not tickets.
5. **Second pass:** have someone else tag 20 of the same tickets. If you agree on fewer than 16 of the 20, tighten the tag definitions and retag.
6. **Report** in the brief as: `tag | accounts | % of sampled accounts | 1–2 verbatim quotes with ticket IDs`.

## Adding evidence to the brief

Paste the interview lines and the tag table into the brief under
**Customer evidence**, with source IDs. The panel can then quote them word for word,
and the validator's `--brief` check can confirm every quote is real.
