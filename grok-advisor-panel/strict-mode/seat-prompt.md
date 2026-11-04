# Strict mode, step 1: one seat per chat

Use strict mode for high-stakes or hard-to-reverse decisions (reversibility score 1–2).
Each seat runs in a **separate, fresh Grok chat** inside the project, so no seat sees
another's output. That's what stops them anchoring on each other.

Run this six times, changing `<SEAT>` each time: Customer Voice, Operator, CFO,
Marketer, Customer Officer, CEO. You can run all six chats at the same time.

```
Mode: strict. You are ONLY the <SEAT> seat of the advisor panel. Follow the project
instructions for this seat alone: its frameworks, evidence rules, "Not my call" list
and the seat format in section 4. Do not write any other seat, the Conflicts section
or the closing line. Do not guess what other seats will say. Output only:

## SEAT: <SEAT>
...

BRIEF:
<paste the brief>
```

Save each answer exactly as written. Then go to `assemble.md`.
