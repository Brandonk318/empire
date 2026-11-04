# Critic worksheet (you fill this in, not Grok)

The panel gives no verdict. This is where **you** push back on the packet and on
your own instinct, before Claude's final assessment. Pick a version:

- **2-minute version:** small, reversible calls (reversibility score 4–5, under ~1 week of effort or ~$5k at stake).
- **Full version:** everything else. Required when the reversibility score is 1–2.

---

## 2-minute version

1. Validator result: PASS / FAIL. *(If FAIL, fix or re-run before going on.)*
2. The one point in the packet I most disagree with, and why (1 line):
3. The biggest `GAP` and whether I can live with not knowing it (1 line):
4. Reversibility score (1–5, see the scale below):
5. Pre-mortem in one line: "It failed because…"
6. My lean, and the cheapest step that tests it this week:

If any answer surprised you, switch to the full version.

---

## Full version

### 1. Packet hygiene (2 min)
- [ ] `python validate_packet.py packet.md --brief brief.md` → PASS (paste the report under §8)
- [ ] I read every `GAP`. The ones I can fill in under a day: ______
- [ ] Customer Voice: evidence floor met? Y / N. If N, have I booked the interviews (`reference/evidence-guide.md`)?

### 2. Suspicious agreement
- Where did seats agree **too easily**? What do they all assume that nobody has checked?
- If convergence was triggered: which "best case for the leading alternative" was most convincing?

### 3. Who's missing from the room?
- A person, segment or constraint none of the six seats speaks for (front-line staff, a partner, regulators, your own energy):

### 4. Pre-mortem
> It's 12 months from now. We did this, and it failed. Write the story of why.

| Failure story | Type | Early warning sign I can watch | Owner |
|---|---|---|---|
| | Tiger (real) / Paper tiger (overblown) / Elephant (nobody's discussing it) | | |
| | | | |
| | | | |

Then the inverse: *it's 12 months later and we **didn't** do it, and that was the mistake. Why?*

### 5. Reversibility score

| Score | Meaning | Example |
|---|---|---|
| 5 | Undo in days, at almost no cost | A copy change, a feature flag |
| 4 | Undo in weeks, small cost, nobody outside notices | A pilot with 20 accounts |
| 3 | Undo in a quarter, real cost or some customers notice | A new-customers-only price |
| 2 | Undoing costs a lot of money or trust | A price change for all customers, a senior hire |
| 1 | Effectively permanent | A sunset after migration, a market entry with an entity, layoffs |

My score: __ . Because: ______
**Rule of thumb:** for a score of 1–2, the decision should wait until every 🔴 GAP is either filled or deliberately accepted below.

### 6. Accepted risks and unknowns
| Risk / GAP | Accept or resolve? | If accepted, why I can live with it |
|---|---|---|

### 7. My lean (still not final)
- Option I lean toward: __  Confidence: Low / Med / High
- What would make me reverse it (metric and threshold):
- Smallest next step that tests it:

### 8. Attach for Claude
Paste into the Claude final-assessment prompt, in this order: (1) the brief, (2) the packet, (3) the validator report, (4) this worksheet.
