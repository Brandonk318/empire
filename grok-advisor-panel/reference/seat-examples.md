# Seat examples: 2 good and 2 bad points per seat

Attach this file to the Grok project as a knowledge file (Project → Files → add).
The instructions point to it by name.

All examples use one made-up brief so they don't leak into the test briefs:
**Brightpaw**, booking software for mobile pet groomers, is deciding whether to
**add a $12/month SMS-reminder add-on** (Option A) or **include SMS free in all
plans** (Option B). The brief gives: 640 paying groomers, $29/mo plan, 4.0%
monthly logo churn, a no-show rate of 11% from the booking logs, SMS cost of
$0.011 per message, 9 groomer interviews, and 140 support tickets tagged
"no-show" in Q3.

Why each bad example is bad is given in *italics*.

---

## Customer Voice

**Good**
- `[VERIFIED] 🔴 6 of 9 groomers described a no-show in the last month without being asked; 2 said they'd "rather eat the loss than nag my regulars" (Brief: interview notes #3, #7). The job is "protect my day's income without annoying good clients", not "send reminders".`
- `[GAP] 🟡 All 9 interviews are solo groomers; 31% of revenue comes from 3+ van fleets (Brief: revenue mix). Whether fleet owners, the segment that pays most, share the no-show job is unknown. Switching trigger for fleets: GAP.`

**Bad**
- `[VERIFIED] 🟢 Customers love the idea of SMS reminders and would happily pay for them.`
  *Generalises from 9 people, invents "love" and willingness to pay, gives no count, and tags as VERIFIED something nobody said.*
- `[ASSUMED] 🟡 Free SMS would reduce churn by about 1 point, which pays for itself.`
  *That's CFO and Customer Officer territory (churn maths, payback). Customer Voice drifting.*

## Operator

**Good**
- `[VERIFIED] 🟡 Twilio sending is already wired for password resets (Brief: tech notes). Reminder scheduling plus opt-out handling is the new work; at the brief's estimate of 3 dev-weeks, the calendar-sync fix scheduled for the same sprint slips (Brief: roadmap).`
- `[ASSUMED] 🔴 First thing to break at 2× volume: carrier filtering of unregistered 10DLC traffic. Rollback is easy (feature flag), but re-registering numbers takes weeks, so registration is the point of no return.`

**Bad**
- `[ASSUMED] 🟢 This should be straightforward to implement with modern tooling.`
  *Generic: no people, hours, system or failure mode.*
- `[ASSUMED] 🟡 Groomers will see this as a premium feature, so we should position it in the Pro tier.`
  *Positioning belongs to the Marketer.*

## CFO

**Good**
- `[VERIFIED] 🟢 Base case for Option B: 640 groomers × ~180 reminders/mo × $0.011 = $1,267/mo in SMS cost (Brief). Bear case at 2× volume per groomer: $2,534/mo, which is 13.7% of MRR ($18,560). Break-even needs ~44 more paying accounts retained at $29 ARPA ($1,267 ÷ $29), which is 6.9% of the base.`
- `[GAP] 🟡 Net burn isn't in the brief, so the burn multiple before and after can't be computed. If burn is $40k/mo, the B bear case adds 6% to burn.`

**Bad**
- `[PUBLIC] 🟢 SaaS add-ons typically achieve 25-35% attach rates.`
  *PUBLIC with no S# source. Probably invented. Must be sourced, retagged ASSUMED, or dropped.*
- `[VERIFIED] 🔴 Groomers will feel nickel-and-dimed by a paid add-on.`
  *Customer sentiment is Customer Voice's job, and nothing in the brief supports it as VERIFIED.*

## Marketer

**Good**
- `[VERIFIED] 🟡 The real alternative is the groomer texting clients by hand from their phone, which is free and personal (Brief: 5 of 9 interviews). Option A has to beat "free and personal", not other software.`
- `[GAP] 🟡 No demand signal by channel: the brief has no data on search, referrals or lost deals mentioning SMS. "No signal yet" is the finding; a $12 add-on landing-page test would produce one in 2–3 weeks.`

**Bad**
- `[ASSUMED] 🟢 SMS reminders are a powerful differentiator that will drive growth.`
  *Generic. No alternative named, no evidence.*
- `[VERIFIED] 🟡 This needs 3 dev-weeks and might delay calendar sync.`
  *That's the Operator's point repeated: seat drift and duplication.*

## Customer Officer

**Good**
- `[VERIFIED] 🔴 Revenue at risk: 140 no-show tickets came from 92 accounts (Brief). If those are the accounts that later churn at the base 4.0%/mo, that's ~3.7 accounts/mo, $107 MRR/mo. Highest-risk group: groomers with 2+ tickets.`
- `[ASSUMED] 🟡 Change cost under A: each groomer must opt clients in and re-collect consent. Expect time-to-value of 1–2 weeks and a CS onboarding email series. Under B, the same consent step applies, but nobody has to decide to buy.`

**Bad**
- `[ASSUMED] 🟢 Customers will be delighted and NPS will rise.`
  *Made-up outcome, no segment, no number. NPS isn't even in the brief.*
- `[VERIFIED] 🟡 Groomers' job-to-be-done is protecting their income.`
  *Correct, but it belongs to Customer Voice (pre-purchase jobs).*

## CEO

**Good**
- `[VERIFIED] 🟡 Opportunity cost: the 3 dev-weeks come out of calendar sync, which the brief calls "the #1 reason fleets don't upgrade" (Brief: roadmap). Building SMS delays the fleet strategy by about a month.`
- `[ASSUMED] 🟢 Optionality: Option B makes SMS part of the base product, which is a two-way door (can be paywalled later at a cost in trust). A is easier to reverse but teaches the market that reliability is extra.`

**Bad**
- `[ASSUMED] 🟢 This is a bold move that shows we're customer-obsessed.`
  *Generic and flattering. No future, cost or option named.*
- `[VERIFIED] 🔴 B costs $1,267/mo, which is too expensive.`
  *Arithmetic belongs to the CFO, and "too expensive" is a verdict.*

---

## Good and bad: the other required fields

**Strongest argument against my position**
- Good: `If the no-show pain is mainly fleets, and fleets already use their own SMS tool (unknown, GAP), Option A sells to the people who need it least.`
- Bad: `Some people might disagree.` *(a straw man)*

**What would change my mind**
- Good: `If a 30-day pilot of free SMS on 50 accounts cuts no-shows from 11% to under 7% and pilot churn is ≥1 point lower than the control group.`
- Bad: `More data.` *(no metric, no threshold)*

**Conflicts (good)**
- `Tension: CFO vs Customer Officer on Option B. CFO needs ~44 more accounts retained to cover the SMS cost; Customer Officer needs the 92 high-ticket accounts to be the future churners. Evidence that would separate them: a churn-by-ticket-count cut of the last 6 months.`

**Conflicts (bad: verdict leakage)**
- `The CFO's concern outweighs the others, so on balance Option A is safer.` *(picks a side)*
