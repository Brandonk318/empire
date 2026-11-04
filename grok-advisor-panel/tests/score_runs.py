#!/usr/bin/env python3
"""Print a validator summary for every run folder under tests/runs/.

    python tests/score_runs.py            # all folders (v1, v2, and any you add, e.g. grok-v2)

Each run file must be named like its brief (01-*.md … 04-*.md). The counts are
mechanical signals that feed the rubric in RESULTS.md; they don't replace reading the packets.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import validate_packet as vp  # noqa: E402


def brief_for(run: Path):
    matches = sorted((HERE / "briefs").glob(run.name[:2] + "-*.md"))
    return matches[0].read_text(encoding="utf-8") if matches else None


def stats(text: str, brief: str | None):
    r = vp.validate(text, brief=brief)
    seats = vp.parse_seats(text.split("\n"))
    pts = [t for s in seats for _, t in s.points]
    changes = [s.fields.get("change", (0, ""))[1] for s in seats]
    return {
        "result": "PASS" if r.ok else "FAIL",
        "fails": len(r.failed),
        "warns": len(r.warnings),
        "points": len(pts),
        "gap_pts": sum("GAP" in vp.tags_in(t) for t in pts),
        "cited_pts": sum(bool(vp.BRIEF_CITE_RE.search(t) or vp.SOURCE_REF_RE.search(t)) for t in pts),
        "change_w_number": f"{sum(bool(re.search(r'[0-9]', c)) for c in changes)}/{len(seats)}",
        "verdict_hits": sum(c.message.count("line ") for c in r.checks
                            if c.name == "verdict language" and c.status == "FAIL"),
    }


def main():
    cols = ["result", "fails", "warns", "points", "gap_pts", "cited_pts", "change_w_number", "verdict_hits"]
    print("| run | " + " | ".join(cols) + " |")
    print("|---" * (len(cols) + 1) + "|")
    for folder in sorted(p for p in (HERE / "runs").iterdir() if p.is_dir()):
        for run in sorted(folder.glob("*.md")):
            s = stats(run.read_text(encoding="utf-8"), brief_for(run))
            print(f"| {folder.name}/{run.stem} | " + " | ".join(str(s[c]) for c in cols) + " |")


if __name__ == "__main__":
    main()
