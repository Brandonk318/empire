# Strict mode, step 2: assemble the packet

Open one more fresh Grok chat in the project and paste the prompt below with the brief
and the six seat outputs. The assembler is a **clerk**: it copies, checks and lists
tensions. It never edits a seat's content or weighs the seats against each other.

```
Mode: strict (assemble step). Below are six seat outputs that were produced in
isolation. Build the packet in the format of section 6 of the project instructions:

1. Header: "# ADVISORY PACKET: …", "Mode: strict", the options, and Brief gaps
   (combine every [GAP] from the seats, deduplicated, citing which seat raised each).
2. Paste the six seats VERBATIM in the standard order. Do not edit, shorten or
   "improve" them. If a seat broke a rule (no tag, over 5 points, a made-up-looking
   number), leave it as is and list it under "Assembler notes" at the end of the header.
3. Run guard G3: if every seat that took a position chose the same option, write
   "CONVERGENCE TRIGGERED: re-run each seat with: 'Add Best case for the leading
   alternative' before finalising" and stop. Do not write that line yourself for them.
4. Write "## Conflicts (unresolved by design)" (2–5 tensions in the standard
   format) and "## Open questions for the user's critic step".
5. End with the exact closing line.

BRIEF:
<paste>

SEAT OUTPUTS:
<paste all six>
```

Then run `python validate_packet.py packet.md --brief brief.md`.
