---
description: Render an agent report as an interactive HTML page with per-finding reply threads, then process the user's replies and re-render with Claude's responses inline
---
# Interactive Agent Report

Convert any agent's Markdown report (code-auditor finding, llm-externalizer scan, plugin-validator audit, etc.) into an **interactive HTML page** with one comment thread per finding. The user reads each finding, types a reply in the per-finding textarea, and clicks **Submit**. Claude reads the per-finding replies and writes a per-finding response that gets rendered inline next to the user's comment in the next round.

## Usage

```
/visual-explainer:interactive-report <report-path>
```

**Arguments:**

- `report-path` — Markdown report from any agent. The report must use `## Finding N: <title>` headings (optional `<!-- ve-finding severity="…" file="…" -->` comments for metadata) so the renderer knows where the per-finding boundaries are. See [the cookbook](../references/interactive-selection.md) for the full convention.

## What this command does

1. Locate the renderer at `${CLAUDE_PLUGIN_ROOT}/scripts/render-interactive-report.py` (or the equivalent path in the project's local plugin tree).
2. Locate the sidecar replies file (`<report>.replies.json` next to the report). If absent, treat as round 0.
3. Run the renderer:
   ```bash
   python3 path/to/render-interactive-report.py \
       --report "$REPORT_PATH" \
       --replies "${REPORT_PATH%.md}.replies.json" \
       --out    "${REPORT_PATH%.md}.html" \
       --runtime-url ve-runtime.js
   ```
   — and copy `ve-runtime.js` next to the rendered HTML if it isn't there yet.
4. Hand the HTML over to whatever browser-launch path the user prefers — most commonly the existing `/share-page` workflow that returns a Vercel URL, or a local `python -m http.server` for offline review.
5. Wait for the user to click Submit (or Exit). The selection POST lands in the file/endpoint the launcher chose (typically `ve-select.py --out /tmp/ve-select-output.json`).
6. Read the captured submission. For every `{kind:"finding-reply", findingId, text}` entry:
   1. Re-read the original finding text from `report.md`.
   2. Re-read any prior conversation rounds from `replies.json`.
   3. Generate a per-finding response — keep the answer scoped to that one finding so the agent's reply lines up next to the user's comment in the rendered HTML.
   4. Append `{round: nextRound, user: text, claude: response}` to `replies.json[findingId]`.
7. Re-run the renderer and re-open the HTML. Loop until the user clicks Exit (no replies typed).

## Wire format

The submit POST body looks like:

```json
{
  "kind": "submit",
  "count": 2,
  "selections": [
    { "kind": "finding-reply", "entryId": "finding-reply:finding-1",
      "findingId": "finding-1",
      "text": "Yes please drop the timer." },
    { "kind": "finding-reply", "entryId": "finding-reply:finding-3",
      "findingId": "finding-3",
      "text": "Agreed — flush the timers on ESC." }
  ]
}
```

The user can also drag-select prose snippets, click code-line numbers, etc. — those entries land in `selections[]` alongside the `finding-reply` entries. Let the user know up front that everything is fair game.

## Replies sidecar format (`<report>.replies.json`)

```json
{
  "rounds": 2,
  "findings": {
    "finding-1": [
      { "round": 1, "user": "I prefer default value.", "claude": "OK, defaulting s to ''." },
      { "round": 2, "user": "Even better, throw a TypeError.", "claude": "Right — throwing is the explicit behaviour." }
    ]
  }
}
```

The renderer reads this and emits one `<div class="ve-finding-round">` per `(findingId, round)` above the always-present new-reply textarea.

## Don't forget

- The runtime JS file (`ve-runtime.js`) MUST be co-located with the rendered HTML or reachable via the `--runtime-url` flag — otherwise the page loads but the textareas don't capture anything.
- `# Finding N` (h1) is **not** detected — only `## Finding N:` (h2). Agents need to use the right level.
- The `<!-- ve-finding ... -->` comment must be on its own line OR immediately after the `## Finding` heading. Comments embedded mid-paragraph aren't picked up.
- When you regenerate `replies.json`, write the WHOLE file — there's no merge step in the renderer.

## See also

- `references/interactive-selection.md` — full wire-format reference for every selection kind including `finding-reply`.
- `design/tasks/TRDD-eff1aa87-cd78-4e0c-bf6c-644c419d65b3-interactive-agent-reports.md` — design rationale and phased plan.
