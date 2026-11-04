# Grok Advisor Panel

A six-seat advisory panel that runs as a Grok project: **Customer Voice, Operator,
CFO, Marketer, Customer Officer, CEO**. The panel **advises only**: no votes, no
verdict, no synthesis that picks a side. **You** do the critic step and make the
decision. **Claude** gives a final assessment of the packet before anything is acted
on or shared.

Adapted from [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
(c-level-agents `boardroom` + c-level-advisor `board-meeting`, MIT). See [Credits](#credits).

## Quick start

Create a Grok project. Paste `grok-instructions.md` into the project instructions and
attach `reference/seat-examples.md` and `reference/evidence-guide.md` as project files.
Write your decision with `brief-template.md`, paste it into a new chat with
`Mode: normal` (or `quick` / `strict`), and save Grok's answer as `packet.md`. Run
`python validate_packet.py packet.md --brief brief.md`; if it fails, paste the report
back to Grok and ask it to fix only those items. Fill in `critic-worksheet.md` yourself
(the 2-minute version for small calls). Then paste the brief, packet, validator report
and worksheet into the prompt in `claude-final-assessment.md`. Decide, and log the
decision in `decision-log.md` with 30- and 90-day review dates.

## The flow

```
 brief-template.md
        │  you write the brief (numbers you have + numbers you DON'T have)
        ▼
 Grok project  ── grok-instructions.md (+ seat-examples.md, evidence-guide.md attached)
        │  6 seats, each with 3 frameworks, tags, ratings, argument-against, change-my-mind
        │  Conflicts listed, never resolved · exact closing line
        ▼
 validate_packet.py  ── PASS/FAIL report (seats, tags, caps, sources, verdict phrases,
        │                 convergence, Customer Voice evidence floor, closing line,
        │                 quotes checked word for word against the brief)
        ▼
 critic-worksheet.md  ── YOU: pre-mortem, reversibility score 1–5, accepted risks, your lean
        ▼
 claude-final-assessment.md  ── Claude: checks the validator report, spot-checks ≥3 sources,
        │                       scores evidence per seat, one-screen format. Still no verdict.
        ▼
 YOU DECIDE  ──►  decision-log.md  ──► 30-day review ──► 90-day review
```

## Modes

| Mode | Points per seat | How it runs | Critic worksheet | Use when |
|---|---|---|---|---|
| **quick** | max 3, 1–3 conflicts | one chat | 2-minute version | reversibility score 4–5; under ~1 week or ~$5k at stake |
| **normal** | max 5, 2–5 conflicts | one chat | full | most decisions |
| **strict** | max 5 | **six separate chats** (one per seat, `strict-mode/seat-prompt.md`), then an assemble chat (`strict-mode/assemble.md`) that copies seats word for word and lists conflicts | full + Claude review required | reversibility score 1–2: senior hires, repricing everyone, market entry, sunsets |

Strict mode exists because seats that see each other's answers anchor on them.
Running them separately is the best protection against groupthink (from the upstream
board-meeting protocol, phase 2).

## What each seat does

| Seat | Lens | Frameworks |
|---|---|---|
| Customer Voice | Before and at the moment of buying or switching | Jobs to be done in the customer's own words · switching triggers (push, pull, anxiety, habit) · who pays vs who uses. **Evidence floor:** 5 direct sources, or `EVIDENCE FLOOR NOT MET` and no position |
| Operator | Can we do it, with these people, by this date? | Capacity maths · first thing to break · sequencing and rollback |
| CFO | Does the money work? | Base and bear case · burn multiple · payback and runway |
| Marketer | Will buyers notice and choose it? | Positioning against real alternatives · demand signal · competitive response |
| Customer Officer | Existing customers after the decision | Retention breakdown · revenue-at-risk map · change cost to the customer |
| CEO | Stronger in 12–24 months? | Opportunity cost · three futures · focus and optionality |

Every seat also gives: a position **from its own lens only**, the strongest argument
against that position, what would change its mind (with a threshold), and sources.
When every seat that took a position chose the same option, each must also make the
best case for the leading alternative.

## Guards against the usual failure modes

| Failure | Guard in the instructions | Checked by the validator |
|---|---|---|
| Made-up quotes or stats | quotes word for word; PUBLIC needs an S# source; missing numbers → `[GAP]` | quotes vs brief (FAIL), PUBLIC→S# (FAIL), VERIFIED numbers not in brief (WARN) |
| Seat drift | "Not my call" list per seat; duplicates deleted | keyword drift and near-duplicate points (WARN) |
| Every seat converging | best case for the leading alternative required | convergence (FAIL if missing) |
| Verdict leaking in | banned phrase list; Conflicts are "unresolved by design" | ~20 verdict patterns plus conflict-resolution words (FAIL) |
| Generic advice | every point must name something specific to the brief | vague "change my mind" (FAIL), no threshold (WARN) |

## Files

```
grok-instructions.md          Grok project instructions (~1,850 words; limit ~2,500)
reference/seat-examples.md    2 good + 2 bad points per seat (attach as a project file)
reference/evidence-guide.md   evidence floor, 20-min interview script, ticket-tagging method
brief-template.md             what to give the panel
validate_packet.py            packet checker (Python 3.9+, standard library only)
critic-worksheet.md           yours: 2-minute and full versions, pre-mortem, reversibility 1–5
claude-final-assessment.md    Claude's review prompt, fixed one-screen output
strict-mode/                  seat-prompt.md (×6 chats) + assemble.md
decision-log.md               fill in after deciding; 30/90-day review prompts
tests/briefs/                 4 test briefs (pricing, new market, key hire, sunset)
tests/BASELINE.md             how the v1 instructions fail on each brief
tests/RESULTS.md              before/after scores
tests/runs/{v1,v2}/           the evaluated packets
tests/test_validate_packet.py unit tests:  python -m unittest discover -s tests
tests/score_runs.py           validator summary table across all runs
vendor/                       source skills this panel draws on (MIT, attributed)
```

### Validator usage

```
python validate_packet.py packet.md                    # basic checks
python validate_packet.py packet.md --brief brief.md   # also checks quotes word for word against the brief
pbpaste | python validate_packet.py - --brief brief.md # pasted from the clipboard (macOS)
python validate_packet.py packet.md --mode quick --json
```
The exit code is 0 for PASS (warnings allowed), 1 for FAIL, 2 for a usage error.

### Changing the closing line

The closing line is defined once in `grok-instructions.md` (§6) and once in
`validate_packet.py` (`CLOSING_LINE`). If you change one, change the other.

## Credits

- **alirezarezvani/claude-skills** (MIT): the board-meeting and boardroom protocol, the
  contribution format, the seat-isolation idea, and the C-level advisor skills that
  the seats draw on.
- **phuryn/pm-skills** (MIT): the interview script (Mom Test), job stories, the
  pre-mortem (tigers, paper tigers, elephants), pricing and segmentation skills.
- **harshilmathur/autodecision** (MIT): the persona council with a "contrarian question"
  per persona, and the decision-journal shape.
- **aiwithremy/claude-skills-llm-council** and **karpathy/llm-council** (no licence
  file, so nothing copied): the context-framing step and anonymised peer review informed
  the strict-mode assemble step.

Copies of the MIT sources, with their licence files and pinned commits, are in
`vendor/`. See `vendor/README.md` for what was taken and how each relates to a seat.
