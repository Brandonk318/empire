# Evaluation results: v1 vs v2

## Read this first: what these numbers are (and aren't)

- **No real Grok runs.** This environment has no Grok/xAI API key. All 8 packets in
  `tests/runs/` were written by Claude, following each instruction set literally:
  `v1/` follows `baseline/v1-instructions-reconstructed.md`, and `v2/` follows `grok-instructions.md`.
- **v1 is reconstructed.** The original panel files weren't in the repo (see the note at
  the top of the v1 file).
- **There's author bias.** The same author wrote the v2 instructions and the v2 packets,
  and the v1 packets show the failures predicted in `BASELINE.md`. Treat the rubric
  scores as a **design check** (does v2 make the good behaviour possible and the bad
  behaviour detectable?), not as proof of how Grok will behave.
- **What is objective:** the validator columns. Those are mechanical, and the
  validator caught real slips in the v2 packets while they were being written (below).
- **To get a real score:** follow "Rerun with real Grok" at the bottom. It takes about 20 minutes.

## Rubric (1–5 per criterion, 25 max per packet)

| Criterion | 1 | 3 | 5 |
|---|---|---|---|
| Specificity | could be pasted into any company's memo | about half the points use the brief's numbers or options | every point is anchored to a number, option, segment or quote from the brief |
| Evidence honesty | made-up quotes, stats or numbers tagged as fact | tags mostly right, some overreach | no fabrication; estimates labelled; missing inputs written as GAP |
| Seat discipline | seats repeat each other or do each other's jobs | some overlap | each point comes from its seat's frameworks |
| Absence of verdicts | panel picks or counts sides | soft hints ("safer path") | no panel stance; convergence guard handled |
| Actionable gaps | "more data" | gaps named, no way to fill them | each gap says what's missing, what it changes and how to get it |

## Scores

| Brief | Version | Specific | Honest | Seats | No verdict | Gaps | **Total** |
|---|---|---|---|---|---|---|---|
| 01 Pricing | v1 | 2 | 2 | 2 | 1 | 1 | **8** |
| | v2 | 5 | 4 | 4 | 5 | 5 | **23** |
| 02 Canada (thin evidence) | v1 | 1 | 1 | 2 | 1 | 1 | **6** |
| | v2 | 4 | 5 | 4 | 5 | 5 | **23** |
| 03 Hire (missing number) | v1 | 2 | 1 | 2 | 1 | 2 | **8** |
| | v2 | 5 | 5 | 4 | 5 | 5 | **24** |
| 04 Sunset | v1 | 2 | 2 | 2 | 1 | 1 | **8** |
| | v2 | 4 | 4 | 4 | 5 | 5 | **22** |
| **Average** | v1 | 1.75 | 1.5 | 2.0 | 1.0 | 1.25 | **7.5** |
| | v2 | 4.5 | 4.5 | 4.0 | 5.0 | 5.0 | **23.0** |

The rubric total roughly **triples** (7.5 → 23). Because each criterion tops out at 5,
the rubric can't show a 5–10× change. The counts below are where the size of the change shows.

## Validator and mechanical counts (`python tests/score_runs.py`)

| run | result | fails | warns | points | GAP points | cited points | change-my-mind with a number | verdict hits |
|---|---|---|---|---|---|---|---|---|
| v1/01-pricing | FAIL | 6 | 4 | 19 | 0 | 0 | 0/6 | 2 |
| v1/02-canada | FAIL | 6 | 5 | 18 | 0 | 0 | 0/6 | 1 |
| v1/03-key-hire | FAIL | 4 | 5 | 18 | 0 | 0 | 0/6 | 1 |
| v1/04-sunset | FAIL | 5 | 4 | 19 | 0 | 0 | 0/6 | 2 |
| v2/01-pricing | PASS | 0 | 0 | 24 | 4 | 17 | 6/6 | 0 |
| v2/02-canada | PASS | 0 | 0 | 21 | 8 | 8 | 6/6 | 0 |
| v2/03-key-hire | PASS | 0 | 0 | 22 | 8 | 11 | 6/6 | 0 |
| v2/04-sunset | PASS | 0 | 1 | 22 | 5 | 10 | 6/6 | 0 |

Across the 4 briefs:

| Signal | v1 | v2 |
|---|---|---|
| Fabrications (made-up stat, quote, number or name presented as fact) | **10**: ARPA "benchmark", a misattributed quote, "frustrated" Canadians, 97,000 restaurants, CAD $100B, "Restaurant365", $800k cash, "most users willing", 85–90% migration stat, causal churn claim | **0** (2 rough estimates, both labelled) |
| Panel-level verdicts | 4 of 4 packets | 0 of 4 |
| Missing inputs written as GAP | 0 | 25 |
| Points with a brief or source cite | 0 of 74 | 46 of 89 |
| "What would change my mind" with a measurable threshold | 0 of 24 | 24 of 24 |
| Convergence handled | v1/02 converged on B and called it "consensus" | v2/04 converged on A; all 6 seats argued the best alternative |

## Per-brief notes

**01 Pricing.** v1 invented a "20–30% ARPA lift" benchmark and turned the Denver quote
into "customers feel per-location pricing is unfair". v2 models A from the brief's own
numbers (+4% to +48% depending on tier mix), finds the 4.6× bill increase for
multi-location accounts, and flags that only 3 of 11 interviews are visible.
*Remaining v2 weaknesses:* Marketer and Customer Voice both lean on the accountant quote
(mild overlap), and Customer Voice's "the job is tax filing" rests on one quote, although it says so.

**02 Canada (thin evidence).** This is where v1 does worst: three unsourced "public" stats,
a named competitor the brief never named, and a VERIFIED claim that Canadian owners are
"frustrated". v2's Customer Voice declares `EVIDENCE FLOOR NOT MET`, takes no position,
and specifies the 5 interviews needed. The seats split B/C instead of converging.
*Remaining v2 weakness:* Customer Officer's "revenue at risk is in the US" point overlaps the CEO's opportunity cost.

**03 Hire (missing number).** v1's CFO assumed $800k cash and tagged the runway VERIFIED,
which is the single most dangerous failure in the set. v2 lists cash as the first Brief gap,
shows runway at $500k / $1.0M / $1.5M, and ties the CFO's "change my mind" to a cash
threshold (≥ $1.3M).

**04 Sunset.** v1's seats all agreed and called it "no significant dissent". v2's seats
also converged (on A, because announcing now gives customers more than the 90 days they
asked for), and the convergence guard made each seat argue for B or C. That surfaced the
year-end payroll season risk and the possibility that the lower churn is selection bias.
*Remaining v2 weaknesses:* the CFO's 10× cost comparison depends on a labelled
$120k-per-engineer estimate, and the Marketer's positioning point is fairly generic.

## What the validator caught while the v2 packets were written

These are real catches, not staged ones:
1. Two tags in one point (`[VERIFIED] … [ASSUMED ramp]`) in 03.
2. Suggested interview questions and messaging lines written in quote marks (01, 03, 04).
   This led to a new rule in the instructions: suggestions go in *italics*.
3. A hypothetical strategy written as a quote (01 CEO).
4. Derived percentages (37%, 61%, 20%, 0.75 FTE) without arithmetic, flagged by the
   numbers-vs-brief check. The arithmetic is now shown.
5. Its own gap: "The panel's balanced view favors Option C" (v1/03) wasn't caught at
   first. The pattern was widened and a regression test added.

## Known limits

- The validator can't detect a made-up claim that **isn't** in quote marks and has no
  number (e.g. "owners are frustrated"). Claude's spot-check step covers that.
- PUBLIC sources are checked for format, not truth. Claude spot-checks them.
- Seat-drift detection uses keywords and only produces warnings.
- Quick and strict modes are covered by unit tests and instructions, not by eval runs.

## Rerun with real Grok

1. Create a Grok project. Paste `grok-instructions.md` as the project instructions and
   attach `reference/seat-examples.md` and `reference/evidence-guide.md` as files.
2. For each brief in `tests/briefs/`, start a new chat: paste the brief and add `Mode: normal`.
3. Save each answer to `tests/runs/grok-v2/<same file name as the v2 run>.md`.
4. Run `python tests/score_runs.py`. The new folder appears as extra rows.
5. Score each packet with the rubric above and add a row to the Scores table.
   For the before-score, do the same with the v1 file as the instructions (`tests/runs/grok-v1/`).
