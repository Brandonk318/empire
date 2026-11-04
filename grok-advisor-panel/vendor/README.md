# Vendored reference skills

These are copies of open-source agent skills that the panel's seats, frameworks and
handoffs draw on. They're **reference material**: deeper playbooks behind each seat.
They are not part of the Grok instructions (too long for project instructions).
Attach one to a Grok project only if you want a seat to go deeper on a specific decision.

Each folder keeps its upstream `LICENSE`. Nothing has been changed.

## Sources (searched November 2026)

| Folder | Upstream | Licence | Commit |
|---|---|---|---|
| `alirezarezvani-claude-skills/` | https://github.com/alirezarezvani/claude-skills | MIT | `c85b17e1fb621ba760478baaacc4fcb9be225e74` |
| `phuryn-pm-skills/` | https://github.com/phuryn/pm-skills | MIT | `2a12295a7717569baa7be181b4cfebe3ca38a6bb` |
| `harshilmathur-autodecision/` | https://github.com/harshilmathur/autodecision | MIT | `967678a25337255b2ff774960fb8f4f4b2e20338` |

Reviewed but **not copied** because they have no licence file:
[aiwithremy/claude-skills-llm-council](https://github.com/aiwithremy/claude-skills-llm-council)
(about 2.9k stars, 5 thinking-style advisors, anonymised peer review, chairman verdict) and
[karpathy/llm-council](https://github.com/karpathy/llm-council). Both end in a
chairman's verdict, which this panel deliberately doesn't do. Their framing and
anonymised-review ideas informed `strict-mode/assemble.md`.

## Which skill supports which seat

| Seat or step | Vendored skill(s) |
|---|---|
| Panel protocol | `alirezarezvani-claude-skills/board-meeting`, `boardroom` |
| Customer Voice | `phuryn-pm-skills/interview-script`, `summarize-interview`, `job-stories`, `user-segmentation`; `harshilmathur-autodecision/persona-council.md` (Customer Advocate) |
| Operator | `alirezarezvani-claude-skills/coo-advisor` |
| CFO | `alirezarezvani-claude-skills/cfo-advisor` (burn, unit economics, scenario scripts) |
| Marketer | `alirezarezvani-claude-skills/cmo-advisor`; `phuryn-pm-skills/pricing-strategy` |
| Customer Officer | `alirezarezvani-claude-skills/chief-customer-officer-advisor` (retention breakdown, segmentation scripts) |
| CEO | `alirezarezvani-claude-skills/ceo-advisor`, `scenario-war-room` |
| Your critic step | `alirezarezvani-claude-skills/executive-mentor` (challenge, stress test); `phuryn-pm-skills/pre-mortem`, `identify-assumptions-existing`, `prioritize-assumptions` |
| Decision log | `alirezarezvani-claude-skills/decision-logger`; `harshilmathur-autodecision/journal-spec.md` |
| Brief templates by decision type | `harshilmathur-autodecision/templates/` (pricing, hiring, expansion, build-vs-buy) |

Note: the upstream skills were written for Claude Code and include votes and synthesis
steps. Where they conflict with this panel's hard constraints (advise only, no verdict),
the panel's rules win.
