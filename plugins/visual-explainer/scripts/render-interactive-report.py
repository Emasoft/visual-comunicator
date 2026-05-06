#!/usr/bin/env python3
"""
render-interactive-report.py — convert an agent's Markdown report to an
interactive HTML page that the visual-explainer runtime can host.

Each `## Finding N: <title>` heading is detected and wrapped in a
<section data-ve-finding-id="finding-N"> with a thread block containing
prior rounds (from a sidecar replies.json) and an always-present
<textarea data-ve-finding-reply> for the next round.

Optional metadata lives in an HTML comment after the heading:
    <!-- ve-finding severity="major" file="src/parser.ts:42" -->
Recognised keys: severity (info/minor/major/critical), file, line.

Usage:
    render-interactive-report.py \
        --report path/to/report.md \
        --replies path/to/report.replies.json \
        --out    path/to/report.html \
        --title  "Code Review (round 2)"

`--replies` is optional. If the file is missing or empty the renderer
emits the page with no prior rounds and the textareas pristine.

`--out` defaults to <report>.html alongside the source.

The generated page links the runtime as `<script src="ve-runtime.js">`
by default. Override with `--runtime-url`.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


FINDING_HEADER_RE = re.compile(
    r"^##\s+Finding\s+(?P<num>[\w.-]+)\s*:?\s*(?P<title>.*?)\s*$",
    re.IGNORECASE,
)

META_COMMENT_RE = re.compile(
    r"<!--\s*ve-finding\s+(?P<attrs>.*?)\s*-->",
    re.IGNORECASE | re.DOTALL,
)

ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')

VALID_SEVERITY = {"critical", "major", "minor", "info"}


@dataclass
class Finding:
    findingId: str
    title: str
    body_md: str
    meta: dict[str, str] = field(default_factory=dict)


@dataclass
class Report:
    preamble_md: str
    findings: list[Finding]
    warnings: list[str]


def parse_report(md: str) -> Report:
    lines = md.splitlines()
    preamble: list[str] = []
    findings: list[Finding] = []
    warnings: list[str] = []
    cur: Finding | None = None
    cur_body: list[str] = []

    def flush_current():
        if cur is not None:
            cur.body_md = "\n".join(cur_body).strip()
            findings.append(cur)

    for idx, raw in enumerate(lines):
        m = FINDING_HEADER_RE.match(raw)
        if m:
            flush_current()
            num = m.group("num").strip()
            title = m.group("title").strip()
            cur = Finding(
                findingId=f"finding-{num}",
                title=title or f"Finding {num}",
                body_md="",
            )
            cur_body = []
            continue
        # Detect non-Finding `##` headings while INSIDE a finding section —
        # they're part of the body. Detect them in PREAMBLE — they're a
        # structural warning (the agent should switch to "## Finding N:").
        if cur is None and raw.startswith("## "):
            warnings.append(
                f"Line {idx+1}: non-Finding `##` heading in preamble — "
                "use `## Finding N: <title>` so the renderer can anchor "
                f"a thread. (found: {raw!r})"
            )
        if cur is None:
            preamble.append(raw)
        else:
            cur_body.append(raw)
    flush_current()

    # Extract per-finding metadata from the first ve-finding comment in
    # each body, then strip that comment line out.
    for f in findings:
        m = META_COMMENT_RE.search(f.body_md)
        if m:
            attrs = dict(ATTR_RE.findall(m.group("attrs")))
            sev = (attrs.get("severity") or "").lower()
            if sev and sev not in VALID_SEVERITY:
                warnings.append(
                    f"Finding {f.findingId}: unrecognised severity {sev!r} — "
                    f"expected one of {sorted(VALID_SEVERITY)}; rendering as 'info'."
                )
                attrs["severity"] = "info"
            f.meta = attrs
            f.body_md = (
                f.body_md[: m.start()] + f.body_md[m.end():]
            ).strip()

    return Report(
        preamble_md="\n".join(preamble).strip(),
        findings=findings,
        warnings=warnings,
    )


# ─────────────────────────────────────────────────────────────────────
# Minimal markdown subset → HTML.
#
# Supports: headings (h1-h6), paragraphs, fenced code blocks (```lang),
# unordered + ordered lists, blockquotes, inline `code`, **bold**,
# *italic*, [text](url) links. Anything else passes through verbatim.
# ─────────────────────────────────────────────────────────────────────


CODE_FENCE_RE = re.compile(r"^```(\w*)\s*$")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
UL_RE = re.compile(r"^\s*[-*+]\s+(.*)$")
OL_RE = re.compile(r"^\s*(\d+)\.\s+(.*)$")
BLOCKQUOTE_RE = re.compile(r"^>\s?(.*)$")
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
ITALIC_RE = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
INLINE_CODE_RE = re.compile(r"`([^`]+)`")


def _inline(text: str) -> str:
    """Run inline markdown (escape first, then linkify, bold, italic, code)."""
    out = html.escape(text)
    out = INLINE_CODE_RE.sub(lambda m: f"<code>{m.group(1)}</code>", out)
    out = LINK_RE.sub(
        lambda m: f'<a href="{html.escape(m.group(2))}">{m.group(1)}</a>', out
    )
    out = BOLD_RE.sub(lambda m: f"<strong>{m.group(1)}</strong>", out)
    out = ITALIC_RE.sub(lambda m: f"<em>{m.group(1)}</em>", out)
    return out


def md_to_html(md: str) -> str:
    if not md:
        return ""
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    paragraph: list[str] = []

    def flush_paragraph():
        if paragraph:
            joined = " ".join(_inline(line) for line in paragraph).strip()
            if joined:
                out.append(f"<p>{joined}</p>")
            paragraph.clear()

    while i < len(lines):
        line = lines[i]
        # Fenced code
        m = CODE_FENCE_RE.match(line)
        if m:
            flush_paragraph()
            lang = m.group(1)
            i += 1
            buf: list[str] = []
            while i < len(lines) and not CODE_FENCE_RE.match(lines[i]):
                buf.append(lines[i])
                i += 1
            i += 1
            cls = f' class="language-{lang}"' if lang else ""
            out.append(
                f"<pre><code{cls}>{html.escape(chr(10).join(buf))}</code></pre>"
            )
            continue
        m = HEADING_RE.match(line)
        if m:
            flush_paragraph()
            level = len(m.group(1))
            out.append(f"<h{level}>{_inline(m.group(2))}</h{level}>")
            i += 1
            continue
        m = UL_RE.match(line)
        if m:
            flush_paragraph()
            items: list[str] = []
            while i < len(lines):
                mm = UL_RE.match(lines[i])
                if not mm:
                    break
                items.append(f"<li>{_inline(mm.group(1))}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        m = OL_RE.match(line)
        if m:
            flush_paragraph()
            items = []
            while i < len(lines):
                mm = OL_RE.match(lines[i])
                if not mm:
                    break
                items.append(f"<li>{_inline(mm.group(2))}</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue
        m = BLOCKQUOTE_RE.match(line)
        if m:
            flush_paragraph()
            buf2: list[str] = [m.group(1)]
            i += 1
            while i < len(lines):
                mm = BLOCKQUOTE_RE.match(lines[i])
                if not mm:
                    break
                buf2.append(mm.group(1))
                i += 1
            inner = "<br>".join(_inline(b) for b in buf2)
            out.append(f"<blockquote>{inner}</blockquote>")
            continue
        if not line.strip():
            flush_paragraph()
            i += 1
            continue
        paragraph.append(line)
        i += 1
    flush_paragraph()
    return "\n".join(out)


# ─────────────────────────────────────────────────────────────────────
# HTML emission.
# ─────────────────────────────────────────────────────────────────────


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  :root {{
    --bg:#faf6ee; --text:#1f1a14;
    --gold:#b8861f;
    --ve-accent: var(--gold);
    --ve-sel-text: #14110b;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#14110b; --text:#ede5dd; --gold:#e0bf5b; --ve-sel-text:#14110b; }}
  }}
  body {{
    margin:0; padding:32px 24px; background:var(--bg); color:var(--text);
    font:17px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;
  }}
  main {{ max-width: 86ch; margin: 0 auto; }}
  h1 {{ font-style: italic; font-weight: 500; margin: 0 0 8px; }}
  h2 {{ margin-top: 0; }}
  pre {{
    background: rgba(0,0,0,0.05);
    border: 1px solid rgba(0,0,0,0.10);
    border-radius: 6px;
    padding: 12px 14px;
    font: 13px/1.55 ui-monospace,Menlo,Consolas,monospace;
    overflow-x: auto;
  }}
  @media (prefers-color-scheme: dark) {{
    pre {{ background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.10); }}
  }}
  code {{ font-family: ui-monospace, Menlo, Consolas, monospace; }}
  blockquote {{
    margin: 12px 0; padding: 8px 14px;
    border-left: 3px solid color-mix(in srgb, var(--gold) 60%, transparent);
    background: color-mix(in srgb, var(--gold) 6%, transparent);
    border-radius: 0 6px 6px 0;
  }}
  .ve-report-banner {{
    margin: 0 0 24px; padding: 14px 18px;
    background: color-mix(in srgb, var(--gold) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent);
    border-radius: 8px;
    font: 14px/1.5 inherit;
  }}
  .ve-report-warning {{
    margin: 6px 0 0; padding: 8px 12px;
    background: color-mix(in srgb, #c0392b 8%, transparent);
    border-left: 3px solid #c0392b;
    border-radius: 0 4px 4px 0;
    font: 13px/1.5 ui-monospace, Menlo, monospace;
  }}
</style>
</head>
<body>
<main>
  <div class="ve-report-banner">
    <strong>Interactive review.</strong> Read each finding below. Type a reply
    in any thread and click <strong>Submit</strong> when done. Claude reads
    each per-finding reply and posts a response inline next to your comment.
  </div>
  {warning_block}
  <article data-ve-prose>
    {preamble_html}
    {findings_html}
  </article>
</main>
<script src="{runtime_url}"></script>
</body>
</html>
"""


def render_finding_html(f: Finding, prior_rounds: list[dict]) -> str:
    sev = (f.meta.get("severity") or "").lower()
    chip_html = ""
    if sev:
        chip_html = (
            f'<span class="ve-finding-chip ve-finding-chip--{html.escape(sev)}">'
            f"{html.escape(sev)}</span>"
        )
    file_html = ""
    if "file" in f.meta:
        file_html = (
            f'<span class="ve-finding-file"><code>{html.escape(f.meta["file"])}</code></span>'
        )
    meta_extra = []
    for k, v in f.meta.items():
        if k in {"severity", "file"}:
            continue
        meta_extra.append(
            f'<span class="ve-finding-meta-extra">{html.escape(k)}: {html.escape(v)}</span>'
        )

    rounds_html = []
    for r in prior_rounds:
        ru = html.escape(r.get("user", "") or "")
        rc = html.escape(r.get("claude", "") or "")
        rn = r.get("round", "?")
        rounds_html.append(
            f'<div class="ve-finding-round" data-round="{html.escape(str(rn))}">'
            f'  <blockquote class="ve-user-comment">'
            f'    <div class="ve-finding-author">You · round {html.escape(str(rn))}</div>'
            f'    {ru}'
            f'  </blockquote>'
            f'  <div class="ve-claude-reply">'
            f'    <div class="ve-finding-author">Claude · round {html.escape(str(rn))}</div>'
            f'    {rc}'
            f'  </div>'
            f'</div>'
        )

    data_attrs = [f'data-ve-finding-id="{html.escape(f.findingId)}"']
    for k, v in f.meta.items():
        data_attrs.append(f'data-ve-finding-{html.escape(k)}="{html.escape(v)}"')

    return (
        f'<section {" ".join(data_attrs)}>\n'
        f'  <h2>{html.escape(f.title)}</h2>\n'
        f'  <div class="ve-finding-meta">{chip_html}{file_html}{"".join(meta_extra)}</div>\n'
        f'  <div class="ve-finding-body">{md_to_html(f.body_md)}</div>\n'
        f'  <div class="ve-finding-thread">\n'
        f'    {"".join(rounds_html)}\n'
        f'    <textarea class="ve-finding-reply" data-ve-finding-reply\n'
        f'              data-ve-finding-id="{html.escape(f.findingId)}"\n'
        f'              placeholder="Reply to this finding…" rows="3"></textarea>\n'
        f'  </div>\n'
        f'</section>\n'
    )


def render(report_md: str, replies: dict, *, title: str, runtime_url: str) -> str:
    rep = parse_report(report_md)
    prior = (replies or {}).get("findings", {})

    findings_blocks = []
    for f in rep.findings:
        rounds = prior.get(f.findingId, [])
        findings_blocks.append(render_finding_html(f, rounds))

    warning_block = ""
    if rep.warnings:
        items = "".join(
            f'<div class="ve-report-warning">⚠ {html.escape(w)}</div>'
            for w in rep.warnings
        )
        warning_block = f"<div>{items}</div>"

    return PAGE_TEMPLATE.format(
        title=html.escape(title),
        warning_block=warning_block,
        preamble_html=md_to_html(rep.preamble_md),
        findings_html="\n".join(findings_blocks),
        runtime_url=html.escape(runtime_url),
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--report", required=True, help="path to the agent's report.md")
    p.add_argument(
        "--replies",
        default=None,
        help="path to the sidecar replies.json (optional; missing is fine)",
    )
    p.add_argument(
        "--out",
        default=None,
        help="output HTML path (default: alongside report with .html)",
    )
    p.add_argument(
        "--title",
        default=None,
        help="page <title> (default: derived from report's first H1 or filename)",
    )
    p.add_argument(
        "--runtime-url",
        default="ve-runtime.js",
        help="src for the <script> tag that loads the runtime (default: ve-runtime.js)",
    )
    args = p.parse_args(argv)

    report_path = Path(args.report)
    if not report_path.exists():
        print(f"error: report not found: {report_path}", file=sys.stderr)
        return 2
    report_md = report_path.read_text(encoding="utf-8")

    replies: dict = {}
    if args.replies:
        rp = Path(args.replies)
        if rp.exists() and rp.stat().st_size > 0:
            try:
                replies = json.loads(rp.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                print(f"error: invalid replies json {rp}: {e}", file=sys.stderr)
                return 3

    title = args.title
    if not title:
        # First H1 in the report wins, then the report filename (no .md).
        for line in report_md.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
        if not title:
            title = report_path.stem

    out_path = Path(args.out) if args.out else report_path.with_suffix(".html")
    html_doc = render(
        report_md, replies,
        title=title,
        runtime_url=args.runtime_url,
    )
    out_path.write_text(html_doc, encoding="utf-8")
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
