"""Tests for validate_packet.py. Run from grok-advisor-panel/:

    python -m unittest discover -s tests -v
"""
import io
import json
import re
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

import validate_packet as vp  # noqa: E402

GOOD = (HERE / "runs" / "v2" / "03-key-hire.md").read_text(encoding="utf-8")
GOOD_BRIEF = (HERE / "briefs" / "03-key-hire-missing-number.md").read_text(encoding="utf-8")

RUNS = {
    "01-pricing": "01-pricing-change",
    "02-canada": "02-new-market-thin-evidence",
    "03-key-hire": "03-key-hire-missing-number",
    "04-sunset": "04-product-sunset",
}


def status(report, name):
    """Worst status reported for a check name (FAIL > WARN > PASS), or None."""
    found = [c.status for c in report.checks if c.name == name]
    for s in ("FAIL", "WARN", "PASS"):
        if s in found:
            return s
    return None


def seat_block(text, seat):
    m = re.search(r"^## SEAT: " + re.escape(seat) + r"\n.*?(?=^## )", text, re.M | re.S)
    return m.group(0)


def replace_once(text, old, new):
    assert old in text, f"fixture text not found: {old[:60]}"
    return text.replace(old, new, 1)


class GoodPacket(unittest.TestCase):
    def test_good_packet_passes(self):
        r = vp.validate(GOOD, brief=GOOD_BRIEF)
        self.assertTrue(r.ok, r.render())
        self.assertEqual(r.warnings, [])

    def test_report_render_header(self):
        out = vp.validate(GOOD).render()
        self.assertTrue(out.startswith("Packet validation: PASS"))


class Seats(unittest.TestCase):
    def test_missing_seat(self):
        bad = GOOD.replace(seat_block(GOOD, "Marketer"), "")
        r = vp.validate(bad)
        self.assertEqual(status(r, "seats"), "FAIL")
        self.assertIn("Marketer", r.render())

    def test_duplicate_seat(self):
        block = seat_block(GOOD, "CFO")
        r = vp.validate(GOOD.replace(block, block + block))
        self.assertEqual(status(r, "seats"), "FAIL")
        self.assertIn("duplicated", r.render())

    def test_plain_heading_accepted(self):
        r = vp.validate(GOOD.replace("## SEAT: Operator", "## Operator"))
        self.assertEqual(status(r, "seats"), "PASS")

    def test_no_seats_does_not_pass_vacuously(self):
        r = vp.validate("# nothing here\n\n" + vp.CLOSING_LINE)
        self.assertEqual(status(r, "points"), "FAIL")
        self.assertEqual(status(r, "seat fields"), "FAIL")


class Points(unittest.TestCase):
    def test_untagged_point(self):
        bad = replace_once(GOOD, "- [ASSUMED] 🔴 First thing to break under A", "- 🔴 First thing to break under A")
        self.assertEqual(status(vp.validate(bad), "points"), "FAIL")

    def test_two_tags_in_one_point(self):
        bad = replace_once(GOOD, "- [ASSUMED] 🔴 First thing to break under A", "- [ASSUMED] [VERIFIED] 🔴 First thing to break under A")
        self.assertEqual(status(vp.validate(bad), "points"), "FAIL")

    def test_unrated_point(self):
        bad = replace_once(GOOD, "- [ASSUMED] 🔴 First thing to break under A", "- [ASSUMED] First thing to break under A")
        self.assertEqual(status(vp.validate(bad), "points"), "FAIL")

    def test_text_ratings_accepted(self):
        ok = replace_once(GOOD, "- [ASSUMED] 🔴 First thing to break under A", "- [ASSUMED] RED First thing to break under A")
        self.assertEqual(status(vp.validate(ok), "points"), "PASS")

    def test_more_than_five_points(self):
        extra = "- [ASSUMED] 🟡 Extra point about rollback risk under option A.\n"
        bad = replace_once(GOOD, "Strongest argument against my position: If cash", extra * 1 + "Strongest argument against my position: If cash")
        r = vp.validate(bad)  # CFO had 5, now 6
        self.assertEqual(status(r, "points"), "FAIL")
        self.assertIn("6 points (max 5", r.render())

    def test_quick_mode_caps_at_three(self):
        r = vp.validate(GOOD.replace("Mode: normal", "Mode: quick"))
        self.assertEqual(status(r, "points"), "FAIL")
        self.assertIn("max 3 in quick", r.render())

    def test_mode_flag_overrides(self):
        r = vp.validate(GOOD, mode="quick")
        self.assertIn("max 3 in quick", r.render())


class ChangeMyMind(unittest.TestCase):
    def test_vague(self):
        for vague in ["More data.", "It depends.", "If customers object.", "N/A"]:
            bad = re.sub(r"(## SEAT: CEO.*?What would change my mind: )[^\n]+", r"\g<1>" + vague, GOOD, flags=re.S)
            self.assertEqual(status(vp.validate(bad), "what would change my mind"), "FAIL", vague)

    def test_empty(self):
        bad = re.sub(r"(## SEAT: CEO.*?What would change my mind:)[^\n]+", r"\1", GOOD, flags=re.S)
        self.assertEqual(status(vp.validate(bad), "seat fields"), "FAIL")

    def test_no_threshold_warns(self):
        bad = re.sub(r"(## SEAT: CEO.*?What would change my mind: )[^\n]+",
                     r"\1If the founder cannot name what they would do with freed time.", GOOD, flags=re.S)
        r = vp.validate(bad)
        self.assertEqual(status(r, "what would change my mind"), "WARN")
        self.assertTrue(r.ok)

    def test_missing_argument_against(self):
        bad = re.sub(r"(## SEAT: Marketer.*?)Strongest argument against my position:[^\n]+\n", r"\1", GOOD, flags=re.S)
        self.assertEqual(status(vp.validate(bad), "seat fields"), "FAIL")


class Sources(unittest.TestCase):
    def test_public_without_source_ref(self):
        bad = replace_once(GOOD, "- [ASSUMED] 🟢 Two AEs can split", "- [PUBLIC] 🟢 Two AEs can split")
        r = vp.validate(bad)
        self.assertEqual(status(r, "sources"), "FAIL")
        self.assertIn("cites no S# source", r.render())

    def test_public_with_defined_url_source_passes(self):
        ok = replace_once(GOOD, "- [ASSUMED] 🟢 Two AEs can split", "- [PUBLIC] 🟢 (S1) Two AEs can split")
        ok = replace_once(ok, "What would change my mind: If more than 60% of last quarter's closes came from founder-originated outreach rather than inbound or referral, the handoff risk makes B weaker.\nSources: Brief",
                          "What would change my mind: If more than 60% of last quarter's closes came from founder-originated outreach rather than inbound or referral, the handoff risk makes B weaker.\nSources: Brief; S1 = https://example.com/report")
        self.assertEqual(status(vp.validate(ok), "sources"), "PASS")

    def test_undefined_source_ref(self):
        bad = replace_once(GOOD, "- [ASSUMED] 🟢 Two AEs can split", "- [PUBLIC] 🟢 (S3) Two AEs can split")
        self.assertIn("S3 is not defined", vp.validate(bad).render())

    def test_source_without_url_or_date(self):
        bad = replace_once(GOOD, "- [ASSUMED] 🟢 Two AEs can split", "- [PUBLIC] 🟢 (S1) Two AEs can split")
        bad = bad.replace("handoff risk makes B weaker.\nSources: Brief", "handoff risk makes B weaker.\nSources: Brief; S1 = some report")
        self.assertIn("needs a URL or a publication + date", vp.validate(bad).render())

    def test_verified_without_sources_line(self):
        bad = re.sub(r"(## SEAT: CFO.*?)Sources: Brief", r"\1Sources: none", GOOD, count=1, flags=re.S)
        r = vp.validate(bad)
        self.assertEqual(status(r, "sources"), "FAIL")
        self.assertIn("CFO: has VERIFIED/PUBLIC points but no Sources listed", r.render())

    def test_verified_without_cite_warns(self):
        bad = replace_once(GOOD, "runs all sales today\" (Brief)", "runs all sales today\"")
        r = vp.validate(bad)
        self.assertEqual(status(r, "sources"), "WARN")
        self.assertTrue(r.ok)


class VerdictLanguage(unittest.TestCase):
    BANNED = [
        "The panel recommends Option C.",
        "Most seats lean toward B.",
        "4 of 6 seats favor C.",
        "Three seats favor A.",
        "There is a clear consensus here.",
        "On balance, C looks safer.",
        "The vote is split.",
        "Option C is the right choice.",
        "We should hire the VP.",
        "Overall, the best option is C.",
        "Final recommendation: A.",
        "The panel's balanced view favors Option C.",
        "Option B has the strongest support.",
    ]

    def test_banned_phrases_anywhere(self):
        for phrase in self.BANNED:
            bad = replace_once(GOOD, "## Open questions", phrase + "\n\n## Open questions")
            self.assertEqual(status(vp.validate(bad), "verdict language"), "FAIL", phrase)

    def test_resolution_words_in_conflicts(self):
        for phrase in ["The CFO's concern outweighs the CEO's.", "The CEO wins this one.",
                       "This tension is resolved by the cash number.", "C is the safer option here."]:
            bad = replace_once(GOOD, "## Open questions", "- " + phrase + "\n\n## Open questions")
            self.assertEqual(status(vp.validate(bad), "verdict language"), "FAIL", phrase)

    def test_no_false_positives(self):
        ok_lines = [
            "- Tension: Marketer vs CFO on win/loss notes; evidence: lost deals by reason.",
            "- Tension: CFO vs Operator; the majority of locations sit in 78 accounts.",
            "- Tension: Operator vs CEO; 4 of 6 called customers said they'd move.",
        ]
        for line in ok_lines:
            ok = replace_once(GOOD, "## Open questions", line + "\n\n## Open questions")
            self.assertEqual(status(vp.validate(ok), "verdict language"), "PASS", line)

    def test_missing_conflicts_section(self):
        bad = re.sub(r"## Conflicts.*?(?=## Open questions)", "", GOOD, flags=re.S)
        self.assertEqual(status(vp.validate(bad), "conflicts section"), "FAIL")


class Convergence(unittest.TestCase):
    def converged(self):
        return re.sub(r"Position \(this seat's lens only\): Option [ABC]",
                      "Position (this seat's lens only): Option C", GOOD)

    def test_all_same_without_alternative_fails(self):
        r = vp.validate(self.converged())
        self.assertEqual(status(r, "convergence"), "FAIL")

    def test_all_same_with_alternative_passes(self):
        text = self.converged().replace(
            "\nSources: Brief\n",
            "\nSources: Brief\nBest case for the leading alternative: For A, founder time is worth more than 20k a month.\n")
        self.assertEqual(status(vp.validate(text), "convergence"), "PASS")

    def test_customer_voice_no_position_does_not_block_trigger(self):
        # GOOD has Customer Voice at "No position"; the other 5 converging still triggers the guard
        self.assertIn("all 5 seats", vp.validate(self.converged()).render())


class CustomerVoice(unittest.TestCase):
    def test_floor_not_met_but_position_taken(self):
        bad = GOOD.replace("Position (this seat's lens only): No position: evidence floor not met",
                           "Position (this seat's lens only): Option A: buyers want credibility")
        self.assertEqual(status(vp.validate(bad), "customer voice evidence"), "FAIL")

    def test_missing_evidence_base(self):
        bad = re.sub(r"Evidence base:[^\n]*\n", "", GOOD)
        self.assertEqual(status(vp.validate(bad), "customer voice evidence"), "FAIL")


class ClosingLine(unittest.TestCase):
    def test_altered(self):
        bad = GOOD.replace(vp.CLOSING_LINE, vp.CLOSING_LINE.replace("advisory only", "advice only"))
        self.assertEqual(status(vp.validate(bad), "closing line"), "FAIL")

    def test_text_after(self):
        bad = GOOD.rstrip() + "\n\nHope this helps!\n"
        r = vp.validate(bad)
        self.assertEqual(status(r, "closing line"), "FAIL")
        self.assertIn("not the last line", r.render())

    def test_closing_line_not_flagged_as_verdict(self):
        self.assertEqual(status(vp.validate(GOOD), "verdict language"), "PASS")


class BriefChecks(unittest.TestCase):
    def test_invented_quote(self):
        bad = replace_once(GOOD, "## Open questions",
                           'Note: one owner said "we would pay double for a real sales rep"\n\n## Open questions')
        r = vp.validate(bad, brief=GOOD_BRIEF)
        self.assertEqual(status(r, "quotes vs brief"), "FAIL")

    def test_curly_quotes_normalised(self):
        ok = GOOD.replace('"want to talk to someone who has run a restaurant"',
                          "“want to talk to someone who has run a restaurant”")
        self.assertEqual(status(vp.validate(ok, brief=GOOD_BRIEF), "quotes vs brief"), "PASS")

    def test_unsupported_verified_number_warns(self):
        bad = replace_once(GOOD, "- [VERIFIED] 🟡 Opportunity cost: the founder",
                           "- [VERIFIED] 🟡 Win rate is 34% (Brief). Opportunity cost: the founder")
        r = vp.validate(bad, brief=GOOD_BRIEF)
        self.assertEqual(status(r, "numbers vs brief"), "WARN")

    def test_quotes_skipped_without_brief(self):
        self.assertIsNone(status(vp.validate(GOOD), "quotes vs brief"))


class CLI(unittest.TestCase):
    def run_cli(self, args, stdin=None):
        buf = io.StringIO()
        old = sys.stdin
        try:
            if stdin is not None:
                sys.stdin = io.StringIO(stdin)
            with redirect_stdout(buf):
                code = vp.main(args)
        finally:
            sys.stdin = old
        return code, buf.getvalue()

    def test_file_pass_exit_zero(self):
        code, out = self.run_cli([str(HERE / "runs/v2/03-key-hire.md")])
        self.assertEqual(code, 0)
        self.assertIn("PASS", out)

    def test_stdin_fail_exit_one(self):
        code, out = self.run_cli(["-"], stdin="random pasted text")
        self.assertEqual(code, 1)
        self.assertIn("FAIL", out)

    def test_json(self):
        code, out = self.run_cli([str(HERE / "runs/v2/03-key-hire.md"), "--json"])
        self.assertEqual(json.loads(out)["result"], "PASS")

    def test_missing_file_exit_two(self):
        code, _ = self.run_cli(["does-not-exist.md"])
        self.assertEqual(code, 2)


class EvalRuns(unittest.TestCase):
    """Regression check on the evaluation runs in tests/runs/."""

    def test_v2_runs_pass_and_v1_runs_fail(self):
        for run, brief in RUNS.items():
            b = (HERE / "briefs" / f"{brief}.md").read_text(encoding="utf-8")
            v2 = vp.validate((HERE / "runs/v2" / f"{run}.md").read_text(encoding="utf-8"), brief=b)
            v1 = vp.validate((HERE / "runs/v1" / f"{run}.md").read_text(encoding="utf-8"), brief=b)
            self.assertTrue(v2.ok, f"v2 {run}:\n{v2.render()}")
            self.assertFalse(v1.ok, f"v1 {run} unexpectedly passed")


if __name__ == "__main__":
    unittest.main()
