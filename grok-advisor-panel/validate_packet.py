#!/usr/bin/env python3
"""Validate a Grok Advisor Panel packet.

Usage:
    python validate_packet.py packet.md                 # file
    pbpaste | python validate_packet.py -               # stdin
    python validate_packet.py packet.md --brief brief.md  # also check quotes against the brief
    python validate_packet.py packet.md --mode quick    # override the Mode: line
    python validate_packet.py packet.md --json          # machine-readable report

Exit code: 0 = PASS (warnings allowed), 1 = FAIL, 2 = usage error.

Standard library only. Checks mirror grok-instructions.md sections 1-6.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field

CLOSING_LINE = (
    "END OF PACKET: advisory only, no verdict. The critic step and the decision "
    "belong to the user. Send to Claude for final assessment before acting or sharing."
)

SEATS = ["Customer Voice", "Operator", "CFO", "Marketer", "Customer Officer", "CEO"]
MAX_POINTS = {"quick": 3, "normal": 5, "strict": 5}
TAGS = ("VERIFIED", "PUBLIC", "ASSUMED", "GAP")
TAG_RE = re.compile(r"\[(VERIFIED|PUBLIC|ASSUMED|GAP)\]|(?<![\w\[])(VERIFIED|PUBLIC|ASSUMED|GAP)(?![\w\]])")
RATING_RE = re.compile(r"(\U0001F7E2|\U0001F7E1|\U0001F534|\b(?:GREEN|AMBER|YELLOW|RED)\b)")
SOURCE_REF_RE = re.compile(r"\bS(\d+)\b")
BRIEF_CITE_RE = re.compile(r"\(\s*brief\b", re.I)

FIELD_NAMES = {
    "evidence base": "evidence",
    "position": "position",
    "points": "points",
    "key points": "points",
    "strongest argument against my position": "against",
    "what would change my mind": "change",
    "sources": "sources",
    "best case for the leading alternative": "alt",
}
FIELD_RE = re.compile(
    r"^\s*(?:[-*]\s+)?\**\s*(" + "|".join(re.escape(k) for k in FIELD_NAMES) + r")\b[^:\n]*:\**\s*(.*)$",
    re.I,
)
BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$")
SEAT_RE = re.compile(
    r"^#{1,4}\s*(?:SEAT\s*:\s*(.+?)|(" + "|".join(re.escape(x) for x in SEATS) + r"))\s*$", re.I | re.M)
H2_RE = re.compile(r"^#{1,3}\s+\S", re.M)

# Panel-level verdict language. Checked across the whole packet (closing line excluded).
BANNED_VERDICT = [
    (r"\b(?:the\s+)?panel\s+(?:recommends?|favou?rs?|leans?|agrees?|supports?|prefers?|concludes?|backs?)\b", "panel-level stance"),
    (r"\bpanel'?s?\b[^.\n]{0,40}?\b(?:favou?rs?|leans?|recommends?|prefers?|supports?|points?\s+to)\b", "panel-level stance"),
    (r"\b(?:has|have|had)\s+the\s+(?:strongest|most|broadest|widest)\s+support\b", "support count"),
    (r"\b(?:we|i|board)\s+recommends?\b", "recommendation"),
    (r"\b(?:our|final|overall|panel'?s?)\s+recommendation\b", "recommendation"),
    (r"\bmajority\s+of\s+(?:the\s+)?(?:seats|advisors|panel)\b", "majority"),
    (r"\b(?:seats|advisors|panel)'?s?\s+majority\b", "majority"),
    (r"\bmost\s+(?:seats|advisors|of\s+the\s+(?:seats|advisors|panel))\b", "seat counting"),
    (r"\b(?:all|every)\s+(?:six\s+|6\s+)?(?:seats|advisors)\s+(?:agree|favou?r|support|lean|prefer)", "seat counting"),
    (r"\b(?:\d|one|two|three|four|five|six)\s*(?:of|out\s+of|/)\s*(?:6|six)\s+(?:seats|advisors)\b", "seat counting"),
    (r"\b(?:\d|two|three|four|five|six)\s+(?:seats|advisors)\s+(?:favou?r|support|lean|prefer|back|agree)", "seat counting"),
    (r"\bconsensus\b", "consensus"),
    (r"\bvot(?:e|es|ed|ing)\b", "vote"),
    (r"\btally\b", "tally"),
    (r"(?<!no )\bverdict\b", "verdict"),
    (r"\bon\s+balance\b", "on balance"),
    (r"\bclear\s+winner\b", "clear winner"),
    (r"\bthe\s+right\s+(?:call|choice|decision|answer|move|option)\b", "the right choice"),
    (r"\bthe\s+best\s+(?:option|choice|path|call)\b", "the best option"),
    (r"\bwe\s+should\b", "we should"),
    (r"\byou\s+should\s+(?:choose|pick|go\s+with|take|do)\b", "you should choose"),
    (r"\bgo\s+with\s+option\b", "go with option"),
    (r"\bthe\s+obvious\s+choice\b", "the obvious choice"),
]
# Extra language that resolves a conflict instead of describing it.
BANNED_IN_CONFLICTS = [
    (r"\boutweighs?\b", "outweighs"),
    (r"\bwins\b|\bwin\b(?![/-])", "wins"),
    (r"\bprevails?\b", "prevails"),
    (r"\bsettles?\b", "settles"),
    (r"\btrumps?\b", "trumps"),
    (r"\btie-?breaker\b", "tie-breaker"),
    (r"\bdecisive\b", "decisive"),
    (r"\btakes?\s+precedence\b", "takes precedence"),
    (r"\bmore\s+important\s+than\b", "more important than"),
    (r"\bresolv(?:e|es|ed|ing)\b", "resolves"),
    (r"\bsafer\s+(?:bet|option|choice)\b", "safer option"),
    (r"\bshould\s+(?:proceed|choose|go|pick)\b", "should proceed"),
]

GENERIC_CHANGE = [
    r"^more\s+data\.?$", r"^n/?a\.?$", r"^none\.?$", r"^nothing\.?$", r"^it\s+depends\.?$",
    r"^tbd\.?$", r"^if\s+customers?\s+(?:object|push\s*back|complain)\.?$", r"^new\s+information\.?$",
    r"^better\s+data\.?$", r"^more\s+evidence\.?$",
]

# Seat-drift hints: terms owned by OTHER seats. Warning only.
DRIFT_TERMS = {
    "Customer Voice": [r"burn multiple", r"\brunway\b", r"\bpayback\b", r"gross margin", r"\bFTEs?\b", r"\bpositioning\b"],
    "Operator": [r"\bpositioning\b", r"\bbrand\b", r"burn multiple", r"jobs? to be done", r"\bpayback\b"],
    "CFO": [r"\bpositioning\b", r"\bmessaging\b", r"\bbrand\b", r"jobs? to be done", r"switching trigger", r"\binterviewees?\b"],
    "Marketer": [r"burn multiple", r"\brunway\b", r"\bFTEs?\b", r"engineer-weeks", r"jobs? to be done"],
    "Customer Officer": [r"jobs? to be done", r"switching trigger", r"\bpositioning\b", r"burn multiple", r"\brunway\b"],
    "CEO": [r"burn multiple", r"\bFTEs?\b", r"switching trigger"],
}


@dataclass
class Check:
    status: str  # PASS / FAIL / WARN
    name: str
    message: str


@dataclass
class Seat:
    name: str
    start_line: int
    fields: dict = field(default_factory=dict)
    points: list = field(default_factory=list)  # (line_no, text)


@dataclass
class Report:
    checks: list = field(default_factory=list)

    def add(self, status, name, message):
        self.checks.append(Check(status, name, message))

    @property
    def failed(self):
        return [c for c in self.checks if c.status == "FAIL"]

    @property
    def warnings(self):
        return [c for c in self.checks if c.status == "WARN"]

    @property
    def ok(self):
        return not self.failed

    def render(self) -> str:
        passed = len([c for c in self.checks if c.status == "PASS"])
        head = "PASS" if self.ok else "FAIL"
        lines = [
            f"Packet validation: {head} ({len(self.failed)} failed, {len(self.warnings)} warnings, {passed} passed)",
            "",
        ]
        order = {"FAIL": 0, "WARN": 1, "PASS": 2}
        for c in sorted(self.checks, key=lambda c: order[c.status]):
            lines.append(f"[{c.status}] {c.name}: {c.message}")
        return "\n".join(lines)

    def to_json(self) -> str:
        return json.dumps(
            {"result": "PASS" if self.ok else "FAIL",
             "checks": [c.__dict__ for c in self.checks]},
            ensure_ascii=False, indent=2,
        )


def tags_in(text: str):
    """Bracketed tags win; bare UPPERCASE tags are accepted only when no bracketed tag exists."""
    found = TAG_RE.findall(text)
    bracketed = [a.upper() for a, _ in found if a]
    return bracketed or [b for _, b in found if b]


def _norm(s: str) -> str:
    s = s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    s = s.replace("—", "-").replace("–", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def _canonical_seat(raw: str):
    raw = re.split(r"\s+[-—–(:]", raw.strip("*# "))[0].strip()
    for s in SEATS:
        if raw.lower() == s.lower():
            return s
    aliases = {"chief customer officer": "Customer Officer", "cco": "Customer Officer",
               "customer-voice": "Customer Voice", "coo": "Operator", "cmo": "Marketer"}
    return aliases.get(raw.lower(), raw)


def parse_seats(lines):
    seats = []
    current = None
    in_points = False
    for i, line in enumerate(lines, start=1):
        m = SEAT_RE.match(line)
        if m:
            current = Seat(_canonical_seat(m.group(1) or m.group(2)), i)
            seats.append(current)
            in_points = False
            continue
        if current is None:
            continue
        if H2_RE.match(line):  # any other heading ends the seat block
            current = None
            continue
        fm = FIELD_RE.match(line)
        if fm:
            key = FIELD_NAMES[fm.group(1).lower()]
            current.fields[key] = (i, fm.group(2).strip())
            in_points = key == "points"
            continue
        if in_points:
            bm = BULLET_RE.match(line)
            if bm:
                current.points.append((i, bm.group(1)))
            elif line.strip() and current.points and line.startswith((" ", "\t")):
                ln, txt = current.points[-1]
                current.points[-1] = (ln, txt + " " + line.strip())
    return seats


def section_lines(lines, title_regex):
    """Return (line_no, text) for lines under the first heading matching title_regex."""
    out, inside = [], False
    pat = re.compile(r"^#{1,3}\s*" + title_regex, re.I)
    for i, line in enumerate(lines, start=1):
        if pat.match(line):
            inside = True
            continue
        if inside and (H2_RE.match(line) or line.strip() == CLOSING_LINE):
            break
        if inside:
            out.append((i, line))
    return out


def detect_mode(text: str):
    m = re.search(r"^\s*\**Mode\**\s*:\s*\**\s*(quick|normal|strict)\b", text, re.I | re.M)
    return m.group(1).lower() if m else None


def option_of(position: str):
    if re.match(r"\s*no\s+position", position, re.I):
        return None
    m = re.search(r"\bOption\s+([A-Z])\b", position) or re.match(r"\s*([A-Z])\)", position)
    return m.group(1) if m else None


def extract_quotes(text: str):
    t = text.replace("“", '"').replace("”", '"')
    return [q for q in re.findall(r'"([^"\n]{3,})"', t) if len(q.split()) >= 4]


def validate(text: str, mode: str | None = None, brief: str | None = None) -> Report:
    r = Report()
    text = text.replace("\r\n", "\n")
    lines = text.split("\n")

    # --- mode -------------------------------------------------------------
    declared = detect_mode(text)
    mode = (mode or declared or "normal").lower()
    if declared is None:
        r.add("WARN", "mode", f"no 'Mode:' line found; validating as {mode}")
    else:
        r.add("PASS", "mode", f"{mode} (max {MAX_POINTS[mode]} points per seat)")
    cap = MAX_POINTS[mode]

    # --- seats ------------------------------------------------------------
    seats = parse_seats(lines)
    names = [s.name for s in seats]
    missing = [s for s in SEATS if s not in names]
    dupes = sorted({n for n in names if names.count(n) > 1})
    unknown = [n for n in names if n not in SEATS]
    if missing or dupes or unknown:
        bits = []
        if missing:
            bits.append("missing: " + ", ".join(missing))
        if dupes:
            bits.append("duplicated: " + ", ".join(dupes))
        if unknown:
            bits.append("unknown seat headings: " + ", ".join(unknown))
        r.add("FAIL", "seats", "; ".join(bits))
    else:
        r.add("PASS", "seats", "all 6 seats present once")
    by_name = {s.name: s for s in seats if s.name in SEATS}

    # --- per-seat checks --------------------------------------------------
    point_fail, field_fail, change_fail, change_warn = [], [], [], []
    src_fail, cite_warn, drift_warn = [], [], []
    for seat in by_name.values():
        n = len(seat.points)
        if n == 0:
            point_fail.append(f"{seat.name}: no points under 'Points:'")
        elif n > cap:
            point_fail.append(f"{seat.name}: {n} points (max {cap} in {mode} mode)")
        for ln, txt in seat.points:
            tags = tags_in(txt)
            if len(tags) != 1:
                point_fail.append(f"{seat.name} line {ln}: needs exactly one tag {list(TAGS)}, found {len(tags)}")
            if not RATING_RE.search(txt):
                point_fail.append(f"{seat.name} line {ln}: no rating (\U0001F7E2/\U0001F7E1/\U0001F534)")

        for key, label in [("position", "Position"), ("against", "Strongest argument against my position"),
                           ("change", "What would change my mind"), ("sources", "Sources")]:
            if key not in seat.fields or not seat.fields[key][1]:
                field_fail.append(f"{seat.name}: '{label}' missing or empty")

        if "change" in seat.fields and seat.fields["change"][1]:
            val = seat.fields["change"][1]
            if any(re.match(p, val.strip(), re.I) for p in GENERIC_CHANGE) or len(val.split()) < 6:
                change_fail.append(f"{seat.name}: too vague ('{val[:60]}'): name a metric and threshold")
            elif not re.search(r"\d", val):
                change_warn.append(f"{seat.name}: no number or threshold in '{val[:60]}'")

        tags_here = {t for _, txt in seat.points for t in tags_in(txt)}
        sources_val = seat.fields.get("sources", (0, ""))[1]
        if tags_here & {"VERIFIED", "PUBLIC"}:
            if not sources_val or re.fullmatch(r"\s*(none|n/?a|-)\s*\.?", sources_val, re.I):
                src_fail.append(f"{seat.name}: has VERIFIED/PUBLIC points but no Sources listed")
        defined = {}
        for m in re.finditer(r"\bS(\d+)\s*[=:]\s*([^;]+)", sources_val):
            defined[m.group(1)] = m.group(2).strip()
        for ln, txt in seat.points:
            tag = (tags_in(txt) or [""])[0]
            refs = SOURCE_REF_RE.findall(txt)
            if tag == "PUBLIC":
                if not refs:
                    src_fail.append(f"{seat.name} line {ln}: PUBLIC point cites no S# source")
                for ref in refs:
                    d = defined.get(ref)
                    if not d:
                        src_fail.append(f"{seat.name} line {ln}: S{ref} is not defined on the Sources line")
                    elif not (re.search(r"https?://", d) or re.search(r"\b(19|20)\d{2}\b", d)):
                        src_fail.append(f"{seat.name}: S{ref} needs a URL or a publication + date")
            elif tag == "VERIFIED" and not (BRIEF_CITE_RE.search(txt) or refs):
                cite_warn.append(f"{seat.name} line {ln}: VERIFIED point has no (Brief: ...) or S# cite")

        for pat in DRIFT_TERMS.get(seat.name, []):
            for ln, txt in seat.points:
                if re.search(pat, txt, re.I):
                    drift_warn.append(f"{seat.name} line {ln}: mentions '{re.search(pat, txt, re.I).group(0)}'; check it belongs to this seat")

    def report(name, fails, ok_msg, warns=None):
        if not by_name and name != "verdict language":
            r.add("FAIL", name, "no seats could be parsed, so this check could not run")
            return
        if fails:
            r.add("FAIL", name, " | ".join(fails))
        else:
            r.add("PASS", name, ok_msg)
        if warns:
            r.add("WARN", name, " | ".join(warns))

    report("points", point_fail, "every point tagged and rated, within the cap")
    report("seat fields", field_fail, "position, argument against, change-my-mind and sources present in every seat")
    report("what would change my mind", change_fail, "specific in every seat", change_warn)
    report("sources", src_fail, "sources listed wherever PUBLIC/VERIFIED tags appear", cite_warn)
    if drift_warn:
        r.add("WARN", "seat drift", " | ".join(drift_warn))

    # duplicate points across seats (a drift signal)
    def toks(s):
        return {w for w in re.findall(r"[a-z0-9$%.]+", s.lower()) if len(w) > 3}
    all_pts = [(s.name, ln, toks(t)) for s in by_name.values() for ln, t in s.points]
    dup = []
    for i in range(len(all_pts)):
        for j in range(i + 1, len(all_pts)):
            a, b = all_pts[i], all_pts[j]
            if a[0] != b[0] and a[2] and b[2]:
                jac = len(a[2] & b[2]) / len(a[2] | b[2])
                if jac >= 0.6:
                    dup.append(f"{a[0]} line {a[1]} ~ {b[0]} line {b[1]}")
    if dup:
        r.add("WARN", "duplicate points", "near-identical points in different seats: " + "; ".join(dup))

    # --- Customer Voice evidence floor -----------------------------------
    cv = by_name.get("Customer Voice")
    if cv:
        fails = []
        if "evidence" not in cv.fields or not cv.fields["evidence"][1]:
            fails.append("missing 'Evidence base:' line")
        block = "\n".join(lines[cv.start_line - 1: (max([cv.start_line] + [ln for ln, _ in cv.points] + [v[0] for v in cv.fields.values()]))])
        floor_not_met = "EVIDENCE FLOOR NOT MET" in block.upper()
        pos = cv.fields.get("position", (0, ""))[1]
        if floor_not_met and not re.match(r"\s*no\s+position", pos, re.I):
            fails.append("says EVIDENCE FLOOR NOT MET but still takes a position on an option")
        report("customer voice evidence", fails,
               "evidence base stated" + ("; floor not met and no position taken" if floor_not_met else ""))

    # --- convergence ------------------------------------------------------
    opts = {s.name: option_of(s.fields.get("position", (0, ""))[1]) for s in by_name.values()}
    taken = {k: v for k, v in opts.items() if v}
    if len(taken) >= 4 and len(set(taken.values())) == 1:
        lead = next(iter(taken.values()))
        lacking = [s.name for s in by_name.values()
                   if not s.fields.get("alt", (0, ""))[1]]
        if lacking:
            r.add("FAIL", "convergence", f"all {len(taken)} seats with a position chose Option {lead}; "
                  f"'Best case for the leading alternative' missing in: {', '.join(lacking)}")
        else:
            r.add("PASS", "convergence", f"convergence on Option {lead} triggered; every seat argued the alternative")
    else:
        r.add("PASS", "convergence", "positions differ (or too few positions to trigger the guard)")

    # --- verdict language -------------------------------------------------
    hits = []
    for i, line in enumerate(lines, start=1):
        if line.strip() == CLOSING_LINE:
            continue
        for pat, label in BANNED_VERDICT:
            if re.search(pat, line, re.I):
                hits.append(f"line {i} ({label}): {line.strip()[:80]}")
    conflicts = section_lines(lines, r"conflicts")
    if not conflicts or not any(l.strip() for _, l in conflicts):
        r.add("FAIL", "conflicts section", "missing or empty '## Conflicts' section")
    else:
        r.add("PASS", "conflicts section", "present")
        for i, line in conflicts:
            for pat, label in BANNED_IN_CONFLICTS:
                if re.search(pat, line, re.I):
                    hits.append(f"line {i} in Conflicts ({label}): {line.strip()[:80]}")
    report("verdict language", hits, "no banned verdict phrases")
    if not section_lines(lines, r"open questions"):
        r.add("WARN", "open questions", "no '## Open questions' section for the critic step")

    # --- closing line -----------------------------------------------------
    nonempty = [l.strip() for l in lines if l.strip()]
    last = nonempty[-1] if nonempty else ""
    if last == CLOSING_LINE:
        r.add("PASS", "closing line", "exact")
    elif CLOSING_LINE in text:
        r.add("FAIL", "closing line", "present but not the last line (nothing may follow it)")
    else:
        r.add("FAIL", "closing line", "missing or altered; must be exactly: " + CLOSING_LINE)

    # --- optional: quotes and numbers against the brief --------------------
    if brief is not None:
        nb = _norm(brief)
        bad = [q for q in extract_quotes(text) if _norm(q) not in nb and _norm(q) not in _norm(CLOSING_LINE)]
        if bad:
            r.add("FAIL", "quotes vs brief", "not found verbatim in brief: " + " | ".join(f'"{q[:70]}"' for q in bad))
        else:
            r.add("PASS", "quotes vs brief", "every quote of 4+ words appears verbatim in the brief")
        brief_nums = set(re.findall(r"\d[\d,]*\.?\d*", brief.replace(",", "")))
        stray = []
        for s in by_name.values():
            for ln, txt in s.points:
                if "VERIFIED" not in tags_in(txt) or re.search(r"[=×÷]|\bx\b", txt):
                    continue  # calculated points show their arithmetic
                for num in re.findall(r"\d[\d,]*\.?\d*", txt):
                    clean = num.replace(",", "").rstrip(".")
                    if clean and clean not in brief_nums and len(clean) > 1:
                        stray.append(f"{s.name} line {ln}: {num}")
        if stray:
            r.add("WARN", "numbers vs brief", "VERIFIED numbers not found in brief (check for fabrication): " + ", ".join(stray[:12]))
    return r


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Validate a Grok Advisor Panel packet.")
    ap.add_argument("packet", nargs="?", default="-", help="packet file, or - for stdin")
    ap.add_argument("--mode", choices=sorted(MAX_POINTS), help="override the packet's Mode: line")
    ap.add_argument("--brief", help="brief file; enables the verbatim-quote and number checks")
    ap.add_argument("--json", action="store_true", help="print a JSON report")
    a = ap.parse_args(argv)
    try:
        if a.packet == "-":
            text = sys.stdin.read()
        else:
            with open(a.packet, encoding="utf-8") as f:
                text = f.read()
        brief = None
        if a.brief:
            with open(a.brief, encoding="utf-8") as f:
                brief = f.read()
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    rep = validate(text, a.mode, brief)
    print(rep.to_json() if a.json else rep.render())
    return 0 if rep.ok else 1


if __name__ == "__main__":
    sys.exit(main())
