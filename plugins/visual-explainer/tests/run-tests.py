#!/usr/bin/env python3
"""Visual-Explainer test orchestrator.

Starts the test server, syncs fresh runtime + regex bundles into
fixtures/, runs every dev-browser test script under scripts/, parses
the `TEST | name | status | desc | detail` lines they print, and
renders a Unicode-bordered results table.

Usage:
    cd plugins/visual-explainer/tests && python3 run-tests.py
    or via the wrapper:  ./run-all-tests.sh

Exits 0 only if every test PASSes. Any FAIL or ERROR aborts with
exit 1 so CI gates stay simple.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PLUGIN_ROOT = ROOT.parent
PROJECT_ROOT = PLUGIN_ROOT.parent.parent
FIXTURES = ROOT / "fixtures"
SCRIPTS = ROOT / "scripts"
QUEUE = Path("/tmp/ve-comments-tests")
PORT = 8767


def sync_runtime_into_fixtures() -> None:
    """Copy the production ve-runtime.js + ve-regex.* into fixtures/.

    The fixtures HTML uses bare relative URLs (`<script src="ve-runtime.js">`)
    so they must sit beside the HTML files. This is the same dance
    `tests_dev/` does — we replicate it under tests/ so the runner is
    fully self-contained.
    """
    src = PLUGIN_ROOT / "scripts"
    for name in ("ve-runtime.js", "ve-regex.umd.js", "ve-regex.css"):
        s = src / name
        d = FIXTURES / name
        if s.exists():
            shutil.copy2(s, d)


def regenerate_sample_report() -> None:
    """Re-run render-interactive-report on fixtures/sample-report.md.

    This produces fresh sample-report.html + sample-report.idmap.json
    so the comment-modal tests always reflect the current renderer.
    """
    md = FIXTURES / "sample-report.md"
    if not md.exists():
        return
    subprocess.run(
        [
            "uv",
            "run",
            "--quiet",
            str(PLUGIN_ROOT / "scripts" / "render-interactive-report.py"),
            "--report",
            str(md),
            "--out",
            str(FIXTURES / "sample-report.html"),
            "--mode",
            "auto",
            "--runtime-url",
            "ve-runtime.js",
        ],
        check=True,
        cwd=str(PROJECT_ROOT),
    )


def clean_queue() -> None:
    if QUEUE.exists():
        for p in QUEUE.iterdir():
            try:
                p.unlink()
            except IsADirectoryError:
                shutil.rmtree(p, ignore_errors=True)
    else:
        QUEUE.mkdir(parents=True, exist_ok=True)


def wait_for_server(timeout_s: float = 10.0) -> bool:
    end = time.time() + timeout_s
    url = f"http://127.0.0.1:{PORT}/regex-vis-all-panels.html"
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


def start_server() -> subprocess.Popen:
    return subprocess.Popen(
        [
            "python3",
            str(ROOT / "server.py"),
            "--port",
            str(PORT),
            "--queue",
            str(QUEUE),
            "--root",
            str(FIXTURES),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        # New process group so the test orchestrator can SIGTERM the
        # whole tree even if the server spawns sub-threads.
        preexec_fn=os.setsid if os.name != "nt" else None,
    )


def stop_server(p: subprocess.Popen) -> None:
    try:
        if os.name != "nt":
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        else:
            p.terminate()
    except ProcessLookupError:
        pass
    try:
        p.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            p.kill()
        except Exception:
            pass


# detail tolerates an empty trailing field when strip() chews the trailing
# space off — the JS prints `… | ${detail}` even when detail is "".
TEST_LINE = re.compile(r"^TEST \| (?P<name>[^|]+?) \| (?P<status>PASS|FAIL|ERROR) \| (?P<desc>[^|]+?) \|\s*(?P<detail>.*)$")


def run_script(script: Path) -> list[dict]:
    """Run one dev-browser script. Return parsed test rows."""
    proc = subprocess.run(
        ["dev-browser", "--timeout", "180", "run", str(script)],
        capture_output=True,
        text=True,
    )
    rows: list[dict] = []
    for line in (proc.stdout or "").splitlines():
        m = TEST_LINE.match(line.strip())
        if m:
            rows.append(m.groupdict())
    if not rows:
        rows.append(
            {
                "name": script.stem,
                "status": "ERROR",
                "desc": "no TEST lines in dev-browser output",
                "detail": ((proc.stderr or "")[:200]).replace("\n", " "),
            }
        )
    return rows


def render_table(rows: list[dict]) -> str:
    cols = [
        ("Test", lambda r: r["name"]),
        ("Status", lambda r: r["status"]),
        ("Description", lambda r: r["desc"]),
    ]
    widths = [max(len(c[0]), *[len(c[1](r)) for r in rows]) for c in cols] if rows else [4, 6, 11]

    def hbar(left: str, mid: str, right: str, fill: str) -> str:
        return left + mid.join(fill * (w + 2) for w in widths) + right

    out = [hbar("┏", "┳", "┓", "━")]
    out.append("┃ " + " ┃ ".join(c[0].ljust(widths[i]) for i, c in enumerate(cols)) + " ┃")
    out.append(hbar("┡", "╇", "┩", "━"))
    for r in rows:
        out.append("│ " + " │ ".join(c[1](r).ljust(widths[i]) for i, c in enumerate(cols)) + " │")
    out.append(hbar("└", "┴", "┘", "─"))
    return "\n".join(out)


def render_failures(rows: list[dict]) -> str:
    bad = [r for r in rows if r["status"] != "PASS"]
    if not bad:
        return ""
    out = ["", "Failure detail:"]
    for r in bad:
        out.append(f"  ✗ {r['name']} ({r['status']}) — {r['desc']}")
        if r.get("detail"):
            out.append("      " + r["detail"][:300])
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--only",
        help="comma-separated list of script stems to run (default: all)",
        default=None,
    )
    args = ap.parse_args()

    sync_runtime_into_fixtures()
    regenerate_sample_report()
    clean_queue()

    server = start_server()
    try:
        if not wait_for_server():
            print("server failed to come up on port", PORT, file=sys.stderr)
            return 2

        scripts = sorted(SCRIPTS.glob("test-*.js"))
        if args.only:
            wanted = {s.strip() for s in args.only.split(",") if s.strip()}
            scripts = [s for s in scripts if s.stem in wanted]

        all_rows: list[dict] = []
        for script in scripts:
            print(f"running {script.name} …", flush=True)
            rows = run_script(script)
            all_rows.extend(rows)
            for r in rows:
                marker = {"PASS": "✓", "FAIL": "✗", "ERROR": "!"}.get(r["status"], "?")
                print(f"  {marker} {r['name']} — {r['status']}", flush=True)
    finally:
        stop_server(server)

    print()
    print(render_table(all_rows))
    extras = render_failures(all_rows)
    if extras:
        print(extras)

    bad = [r for r in all_rows if r["status"] != "PASS"]
    print(
        f"\n{len(all_rows) - len(bad)}/{len(all_rows)} passed."
        + ("  All green." if not bad else f"  {len(bad)} failing.")
    )
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
