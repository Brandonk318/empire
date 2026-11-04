# ADVISORY PACKET: Shut down the payroll add-on by the end of Q1?
Mode: normal
Options: A) sunset end of Q1 with partner migration  B) sunset end of Q2 with a longer runway  C) keep it and raise the price to $29
Brief gaps:
- Current monthly cost of the third-party payroll API (only the +40% April increase is given).
- Loaded cost of the 0.75 FTE maintaining payroll (1.5 engineers × ~half time).
- Total MRR of the 37 payroll accounts (only the $780 add-on MRR is given).
- The partner's price to customers, needed to value the 10% revenue share.
- Whether "Q1" means calendar Q1 2027 (assumed below).

## SEAT: Customer Voice
Evidence base: 0 interviews, 6 calls (5 answered), 0 tickets, 0 other; from paying segment: yes
Position (this seat's lens only): Option A: the customers reached asked for 90 days and migration help, and an end-of-Q1 date announced now gives more than 90 days.
Points:
- [VERIFIED] 🟢 Evidence floor met, barely: 5 answered calls out of 37 payroll accounts (Brief). 4 of 5 said they'd move if given 90 days and migration help. The job is *payroll that doesn't cause trouble*, not payroll inside Tallyhouse.
- [VERIFIED] 🔴 "if payroll goes, we go" (Brief: 3 locations, $192/mo). That's 1 of 5 answered (1 ÷ 5 = 20% of the sample), but the sample is too small to project to 37 accounts.
- [ASSUMED] 🟡 Switching anxiety: tips allocation errors and late filings (Brief: P1 causes) suggest the anxiety is about getting payroll wrong during the move, not about losing the feature. Migration help is the trigger to address.
- [GAP] 🟡 31 of the 37 accounts weren't called. Which segment the 1 "we go" account represents (multi-location?) is unknown.
Strongest argument against my position: An announcement isn't a migration. If the 4 "will move" customers need hands-on help and the partner is slow, the 90 days on paper won't be 90 days in practice.
What would change my mind: If calls to 10 more payroll accounts show 3+ more saying they'd leave Tallyhouse with payroll.
Sources: Brief
Best case for the leading alternative: For B: customers' own words set "90 days and help" as the condition; end of Q2 gives a margin if the partner onboarding is slower than promised.

## SEAT: Operator
Position (this seat's lens only): Option A: it ends the API contract before the April price rise and frees 0.75 FTE in Q2.
Points:
- [VERIFIED] 🔴 Payroll causes 31% of P1 incidents and takes 1.5 engineers at roughly half time, i.e. 1.5 × 0.5 = 0.75 FTE (Brief). That's the largest single source of P1s from 9% of accounts.
- [ASSUMED] 🟡 Sequencing: announce by early January → partner migration February–March → read-only access to payroll history through Q2 for year-end records. The point of no return is the API contract end date.
- [GAP] 🟡 Whether the API contract can end on March 31 without penalties isn't stated; the whole timing of A depends on it.
- [ASSUMED] 🔴 First thing to break: tip-allocation data in migration. The P1 cause (Brief) is the data most likely to move wrongly to the partner.
Strongest argument against my position: Running a migration in Q1 overlaps with W-2 and year-end payroll filing, the busiest and riskiest payroll period of the year.
What would change my mind: If the API contract allows month-to-month at the old price through June 30, the April deadline disappears and B's longer runway costs nothing extra.
Sources: Brief
Best case for the leading alternative: For B: moving payroll in Q2 avoids the year-end filing season entirely, and 31% of P1s suggest the team's error rate is highest exactly when the stakes are highest.

## SEAT: CFO
Position (this seat's lens only): Option A: it avoids the 40% API increase and turns a cost centre into referral income.
Points:
- [VERIFIED] 🟡 Revenue removed: $780 MRR of add-on revenue (Brief). Partner referral income if all 37 accounts move: 37 × $40 = $1,480 one-off, plus 10% revenue share for 12 months (value unknown, see GAP).
- [GAP] 🔴 The cost side is missing: the API cost before and after April, and the 0.75 FTE's loaded cost. Base case can't be completed. At an assumed $120k loaded cost per engineer [rough estimate], 0.75 FTE ≈ $7,500/mo, almost 10× the add-on revenue.
- [ASSUMED] 🔴 Bear case: 20% of the 37 accounts churn entirely, matching the 1-in-5 sample. That's ~7 accounts; if they look like the $192/mo account, ~$1,350/mo MRR lost, which is more than the $780 add-on itself.
- [VERIFIED] 🟡 Under C at $29: if every account stayed, 52 locations ($780 ÷ $15) × $29 = $1,508/mo. That still has to cover a 40% higher API cost and the 0.75 FTE (Brief).
Strongest argument against my position: The 1.9% vs 3.1% churn gap (Brief), if payroll causes it, is worth more than everything above: on 37 accounts it's ~0.4 accounts/mo retained.
What would change my mind: If the loaded engineering cost plus the post-April API cost comes to under $1,500/mo, C covers its cost and A's financial case is gone.
Sources: Brief
Best case for the leading alternative: For C: if the API and engineering costs are lower than assumed, $1,508/mo with fewer incidents (after fixing tips) is a profitable feature that keeps the stickiest accounts.

## SEAT: Marketer
Position (this seat's lens only): Option A: *we partner with a payroll specialist* is an easier story to tell than *our payroll had issues*.
Points:
- [ASSUMED] 🟢 Positioning: framing it as *best-in-class payroll through our partner* turns a retreat into a partnership, which is common in the category.
- [GAP] 🟡 Demand signal: we don't know if payroll appears in sales conversations or lost-deal notes. If prospects ask for it, removing it costs future deals, not just current revenue.
- [ASSUMED] 🟡 Competitive response: competitors with built-in payroll may target the 37 accounts during the migration window. The longer it runs (B), the longer that window.
Strongest argument against my position: A fast exit looks like a failure to customers who were promised an all-in-one tool. Messaging can't fully hide that.
What would change my mind: If more than 10% of recent demos or lost deals mention payroll as a requirement.
Sources: Brief
Best case for the leading alternative: For B: an unhurried migration with personal help is itself the marketing message, *we moved you carefully*, and protects word of mouth in a referral-driven market.

## SEAT: Customer Officer
Position (this seat's lens only): Option A, but only with a named migration owner and a call to every one of the 37 accounts.
Points:
- [VERIFIED] 🔴 Revenue-at-risk map: 37 accounts. The highest-risk group is multi-location payroll users like the $192/mo, 3-location account that said they'd leave (Brief).
- [VERIFIED] 🟡 Retention: payroll accounts churn at 1.9%/mo vs 3.1% (Brief). This may be selection bias (committed accounts buy add-ons) rather than payroll causing retention. Under any option, watch their churn for 2 quarters after the change.
- [ASSUMED] 🟡 Change cost for customers: new payroll setup, employee re-onboarding and a tax-account handover. Time-to-value at the partner is likely 2–4 weeks per account.
- [GAP] 🟡 Who owns migration help: CS capacity for 37 hands-on migrations isn't stated.
Strongest argument against my position: If payroll does cause the lower churn, sunsetting removes a retention feature, and the effect only shows up 2–3 quarters later.
What would change my mind: If accounts that adopted payroll churn at least 0.5 points/mo less after adopting than before (a before/after comparison, not between groups).
Sources: Brief
Best case for the leading alternative: For C: keeping payroll at $29 keeps the 1.9%-churn accounts untouched, and fixing tips allocation alone may remove most of the P1 burden.

## SEAT: CEO
Position (this seat's lens only): Option A: payroll isn't the company's core bet, and it consumes engineering that is.
Points:
- [VERIFIED] 🟡 Opportunity cost: 1.5 engineers × half time = 0.75 FTE (Brief) out of a small team, spent on a product that serves 9% of accounts.
- [ASSUMED] 🟡 Three futures at 18 months under A: going well, the partner deal becomes a referral channel and the team is focused; as expected, a handful of accounts leave and nobody misses payroll; going badly, competitors with payroll use "Tallyhouse dropped payroll" in sales.
- [ASSUMED] 🟢 Optionality: a partner integration keeps the door open to embedding payroll later without owning compliance. Sunsetting is one-way for the code, but two-way for the customer offering.
Strongest argument against my position: The all-in-one story may be the brand's strategic position for restaurants; trading it for focus is a strategy change, not a product cleanup.
What would change my mind: If the company's 12-month strategy depends on an all-in-one back-office story, keeping payroll (C) matters more than the 0.75 FTE.
Sources: Brief
Best case for the leading alternative: For B: the same strategic result one quarter later, with less risk of a visible migration failure during year-end payroll.

## Conflicts (unresolved by design)
- Tension: Operator vs Customer Voice on timing. Operator's case for A rests on the April API increase; Customer Voice's condition is 90 days and help, which A meets on paper but which the year-end filing season may compress. Evidence that would separate them: the API contract terms and the partner's onboarding time per account.
- Tension: CFO vs Customer Officer on the 1.9% vs 3.1% churn gap. CFO's case for A needs it to be selection; Customer Officer flags it may be causal. Evidence that would separate them: churn of the same accounts before vs after they adopted payroll.
- Tension: CEO vs Marketer on brand. CEO treats payroll as non-core; Marketer flags the all-in-one promise. Evidence that would separate them: how often payroll comes up in demos and lost deals.

## Open questions for the user's critic step
- What do the API (before/after April) and the 0.75 FTE actually cost per month?
- Can the payroll API contract end on March 31, and what does month-to-month cost?
- Before/after churn for accounts that adopted payroll: is the retention effect real?

END OF PACKET: advisory only, no verdict. The critic step and the decision belong to the user. Send to Claude for final assessment before acting or sharing.
