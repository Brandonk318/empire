# Baseline: how the v1 instructions fail on the 4 test briefs

Instructions under test: `tests/baseline/v1-instructions-reconstructed.md`. The
original v1 file was missing from the repo, so this is a rebuilt version; see the
note at the top of that file.

Method: each brief was read against v1 one rule at a time, asking "what does this
wording allow or invite?" Each predicted failure below points to the v1 gap that
causes it. The four failure types are **FAB** (fabrication), **GEN** (generic
advice), **BLEED** (role bleed) and **VERDICT** (a hidden verdict).

## Gaps in v1 that cause the failures

| # | v1 gap | Invites |
|---|---|---|
| G1 | `PUBLIC = public information` with no source required | FAB: invented market stats look "public" |
| G2 | No rule about quotes; Customer Voice "speaks for the customer" | FAB: invented or paraphrased quotes inside quote marks |
| G3 | Nothing on what to do about a missing number | FAB: a plausible guess slotted in, or the gap is quietly skipped |
| G4 | Seats are one-line labels with no lens, frameworks or no-go zones | GEN + BLEED |
| G5 | Customer Voice and Customer Officer are not separated | BLEED: both talk about churn |
| G6 | `Position:` and `Note the strongest dissent` without a ban on counting or resolving | VERDICT: "5 of 6 seats favor B" |
| G7 | No check for convergence | Six seats agree and nobody argues the other side |
| G8 | Rating colours (🟢🟡🔴) are not defined | Ratings become decoration |
| G9 | "What would change my mind" needs no threshold | "More data" / "If customers object" |
| G10 | No packet checker | None of the above is caught before Claude sees it |

## Brief 01: Pricing change (good evidence)

| Type | Predicted failure | Cause |
|---|---|---|
| GEN | Marketer: "Tiered pricing aligns value with willingness to pay and supports upsell." Every SaaS pricing memo says this; it doesn't use the 78 multi-location accounts holding 237 locations. | G4 |
| FAB | CFO: "Industry benchmarks show tiered pricing lifts ARPA 20-30% [PUBLIC]." No source; the number is made up. | G1 |
| FAB | Customer Voice turns the Denver quote into "customers feel per-location pricing is unfair" and puts it in quote marks. That's 1 of 11 interviews presented as general sentiment. | G2 |
| BLEED | Customer Officer and Customer Voice both lead with churn, and CFO models the grandfathering *communications plan*. | G4, G5 |
| VERDICT | Conflicts: "Most seats lean toward Option B (new customers only), which balances risk." A tally plus a pick. | G6 |
| Weak gaps | "What would change my mind: if customers push back." No threshold, no way to test it. | G9 |

**Most likely dominant failure:** hidden verdict, because option B is the obvious middle path and v1 doesn't stop the panel converging on it.

## Brief 02: New market, Canada (thin customer evidence)

| Type | Predicted failure | Cause |
|---|---|---|
| FAB | Customer Voice writes "Canadian restaurant owners are frustrated with existing bookkeeping tools" as VERIFIED. The brief has 3 unconverted inbound requests and one dinner conversation. | G2, and no rule for thin evidence |
| FAB | Marketer: "Canada's restaurant market is worth $X billion with N independent operators [PUBLIC]." This may be real or invented, and there's no source either way. | G1 |
| FAB | Gives the unnamed competitor a name and a launch result. | G1 |
| GEN | CEO: "International expansion diversifies revenue and signals ambition." Doesn't weigh 4.2% MoM US growth against 10-14 engineer-weeks. | G4 |
| BLEED | Operator gives a market-sizing opinion, and CFO gives a positioning opinion. | G4 |
| VERDICT | Everyone backs option B (demand test) because it's cheap and reasonable, and Conflicts says "consensus: run the test." | G6, G7 |
| Weak gaps | Nobody says plainly that **customer evidence is basically zero**. The gap gets softened into "more research is needed." | G9, no evidence-floor rule |

**Most likely dominant failure:** fabrication. The less evidence there is, the more a model fills the space with plausible market colour.

## Brief 03: Key hire (missing number: cash in bank)

| Type | Predicted failure | Cause |
|---|---|---|
| FAB | CFO computes runway from a guessed cash balance ("assuming ~$800k, runway is ~12 months") and tags the result VERIFIED because burn is in the brief. | G3 |
| FAB | Alternatively the CFO skips runway altogether, and the most important missing input never shows up as a gap. | G3 |
| GEN | CEO: "A strong sales leader is a force multiplier." Doesn't compare $185k + $60k OTE against $2,600/month net new MRR. | G4 |
| BLEED | Customer Voice has little customer evidence, so it drifts into "a VP would build a stronger culture" (HR/CEO territory). | G4, and no "evidence is thin, say so" path |
| VERDICT | "The panel's balanced view favors option C." | G6 |
| Weak gaps | "What would change my mind: the cash number." Right instinct, but no threshold such as "runway < 15 months at post-hire burn". | G9 |

**Most likely dominant failure:** fabrication of the missing number, or silently routing around it.

## Brief 04: Product sunset (payroll add-on)

| Type | Predicted failure | Cause |
|---|---|---|
| FAB | Customer Voice: "Most payroll users are willing to migrate." That's 4 of 6 called, out of 37. One loud "if payroll goes, we go" gets either dropped or overweighted. | G2 |
| GEN | Operator: "Sunsetting reduces complexity and frees resources." Doesn't price the 0.75 FTE or the 31% of P1s. | G4 |
| BLEED | CFO and Customer Officer both argue the lower-churn correlation (1.9% vs 3.1%). Nobody says it may be selection bias (sticky accounts buy add-ons) rather than payroll causing retention. | G4, G5 |
| VERDICT | "All seats agree payroll should be sunset; the only question is timing." Convergence with no counter-case. | G6, G7 |
| Weak gaps | Missing numbers aren't flagged: the migration cost per account, and the partner's real conversion rate. | G3 |

**Most likely dominant failure:** convergence presented as consensus (a verdict in all but name).

## Summary

| Brief | FAB | GEN | BLEED | VERDICT | Dominant |
|---|---|---|---|---|---|
| 01 Pricing | ● | ● | ● | ● | VERDICT |
| 02 Canada (thin evidence) | ●● | ● | ● | ● | FAB |
| 03 Hire (missing number) | ●● | ● | ● | ● | FAB |
| 04 Sunset | ● | ● | ● | ●● | VERDICT via convergence |

The before-scores for these runs are in `tests/RESULTS.md`.
