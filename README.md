<p>
  <img src="banner.png" alt="visual-explainer" width="1100">
</p>

# visual-explainer

**An agent skill that turns complex terminal output into styled HTML pages you actually want to read.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

Ask your agent to explain a system architecture, review a diff, or compare requirements against a plan. Instead of ASCII art and box-drawing tables, it generates a self-contained HTML page and opens it in your browser. **Every page is interactive** — single-click any element (a Mermaid node, a card, a chart point, a table row) and the window closes itself, returning the selection to the agent so you can ask "what should I do about this?" without typing it out.

```
> draw a diagram of our authentication flow
> /diff-review
> /plan-review ~/docs/refactor-plan.md
```

https://github.com/user-attachments/assets/55ebc81b-8732-40f6-a4b1-7c3781aa96ec

## Why

Every coding agent defaults to ASCII art when you ask for a diagram. Box-drawing characters, monospace alignment hacks, text arrows. It works for trivial cases, but anything beyond a 3-box flowchart turns into an unreadable mess.

Tables are worse. Ask the agent to compare 15 requirements against a plan and you get a wall of pipes and dashes that wraps and breaks in the terminal. The data is there but it's painful to read.

This skill fixes that. Real typography, dark/light themes, interactive Mermaid diagrams with zoom and pan. No build step, no dependencies beyond a browser.

## Install

| Harness | Support | Install path / behavior |
|---|---|---|
| Claude Code | Marketplace plugin | Preserved marketplace shape with source at `plugins/visual-explainer/` |
| Pi | Package metadata plus installer | `package.json` advertises the skill and prompts; `install-pi.sh` installs to `~/.pi/agent/skills/visual-explainer` and `~/.pi/agent/prompts/` |
| Codex CLI | Native skill path plus optional prompts | Copy to `~/.codex/skills/visual-explainer`; optional prompts go in `~/.codex/prompts/` if your Codex build supports them |
| OpenCode/opencode | Observed skill/command paths | Copy to `~/.config/opencode/skill/visual-explainer`; optional commands go in `~/.config/opencode/command/` |
| Cursor | Rules-based guidance | Add the supplied `.mdc` rule; Cursor is not treated as native Agent Skills support |
| OpenClaw | Lightweight AGENTS/rules guidance | Use the supplied AGENTS guidance with the canonical skill directory |

**Claude Code (marketplace):**
```shell
/plugin marketplace add nicobailon/visual-explainer
/plugin install visual-explainer@visual-explainer-marketplace
```

Note: Claude Code plugins namespace commands as `/visual-explainer:command-name`.

**Pi:**
```bash
pi install git:github.com/nicobailon/visual-explainer
```

Or from a local checkout:
```bash
git clone --depth 1 https://github.com/nicobailon/visual-explainer.git
pi install ./visual-explainer
```

The package manifest advertises the canonical skill and command templates:

```json
"pi": {
  "skills": ["./plugins/visual-explainer"],
  "prompts": ["./plugins/visual-explainer/commands"]
}
```

If you previously used the old curl/manual installer, remove those copied files before using `pi install`; otherwise Pi will report skill and prompt conflicts because the user-level copies shadow the package resources:

```bash
rm -rf ~/.pi/agent/skills/visual-explainer
rm -f ~/.pi/agent/prompts/{diff-review,fact-check,generate-slides,generate-visual-plan,generate-web-diagram,plan-review,project-recap,share-page}.md
```

The legacy installer still works if you prefer copied files over package management:

```bash
curl -fsSL https://raw.githubusercontent.com/nicobailon/visual-explainer/main/install-pi.sh | bash
```

**Codex CLI:**
```bash
git clone --depth 1 https://github.com/nicobailon/visual-explainer.git /tmp/visual-explainer

mkdir -p ~/.codex/skills ~/.codex/prompts
cp -R /tmp/visual-explainer/plugins/visual-explainer ~/.codex/skills/visual-explainer

# Optional, only if your Codex build supports prompt templates:
cp /tmp/visual-explainer/plugins/visual-explainer/commands/*.md ~/.codex/prompts/

rm -rf /tmp/visual-explainer
```

Invoke with `$visual-explainer` or ask Codex to use the `visual-explainer` skill. If prompts are installed and supported, use `/prompts:diff-review`, `/prompts:plan-review`, etc.

**OpenCode/opencode:**
```bash
git clone --depth 1 https://github.com/nicobailon/visual-explainer.git /tmp/visual-explainer

mkdir -p ~/.config/opencode/skill ~/.config/opencode/command
cp -R /tmp/visual-explainer/plugins/visual-explainer ~/.config/opencode/skill/visual-explainer

# Optional command templates:
cp /tmp/visual-explainer/plugins/visual-explainer/commands/*.md ~/.config/opencode/command/

rm -rf /tmp/visual-explainer
```

Activate it by asking OpenCode to use the `visual-explainer` skill. Command-template behavior depends on the installed OpenCode/opencode build.

**Cursor:**

Add `configs/cursor/visual-explainer.mdc` to your Cursor rules, or copy its contents into the project rules UI. This is rules-based guidance that points Cursor at the canonical skill; it does not claim native Agent Skills support.

**OpenClaw:**

Use `configs/openclaw/AGENTS.md` as lightweight project guidance and copy or reference `plugins/visual-explainer/` as the canonical skill source. No native OpenClaw plugin adapter is included.

## Commands

| Command | What it does |
|---------|-------------|
| `/generate-web-diagram` | Generate an HTML diagram for any topic |
| `/generate-visual-plan` | Generate a visual implementation plan for a feature or extension |
| `/generate-slides` | Generate a magazine-quality slide deck |
| `/diff-review` | Visual diff review with architecture comparison and code review |
| `/plan-review` | Compare a plan against the codebase with risk assessment |
| `/project-recap` | Mental model snapshot for context-switching back to a project |
| `/fact-check` | Verify accuracy of a document against actual code |
| `/share-page` | Deploy an HTML page to Vercel and get a live URL |

The agent also kicks in automatically when it's about to dump a complex table in the terminal (4+ rows or 3+ columns) — it renders HTML instead.

## Interactive Selection

Every page generated by `visual-explainer` is interactive by default. There is no `--interactive` flag — clickability is the baseline.

**Single-click selection.** Click any meaningful element (a Mermaid node, a section card, a KPI, a table row, a slide, a chart datapoint). The browser window closes automatically and the agent receives a structured payload:

```json
{
  "id": "ve-mermaid-validate",
  "type": "mermaid-node",
  "label": "Validate input",
  "data": { "diagramId": "auth-flow" }
}
```

The agent's next reply opens with:

> You selected the element **Validate input** (`mermaid-node: ve-mermaid-validate`). What do you want me to do about it?

…and acts on the user's instruction. Typical follow-ups: replace this step with a different one, insert a new step before/after, change a value in this row, compute the average for this datapoint, treat this row as the parameters for a deployment, etc.

**Tables-as-questions.** Instead of asking a multiple-choice question in chat, the agent can render a table with radio (single-choice) or checkbox (multi-choice) row selection plus a "Write something else here:" free-text fallback row. Submit returns the structured answer. This works as a drop-in replacement for the agent's "ask a question" component.

**Prose pages get paragraph numbering + text-snippet selection.** Wrapping an article in `<article data-ve-prose>` makes the runtime auto-number every heading and paragraph hierarchically (`1`, `1.1`, `1.1.2`) and insert a small marker at the start of each. Click a paragraph to select the whole thing; or **highlight text with the mouse** to surface an "Ask about this snippet" button that returns the highlighted phrase plus its paragraph number. Reordering works naturally — "move 1.1.2 to the start", "swap 1.1.2 and 2.3.1".

**Math, chemistry, physics, and full TikZ diagrams.** `<span class="ve-math">E=mc^2</span>` renders via KaTeX (mhchem extension for chemistry, copy-tex extension so right-click copies back the LaTeX source). The runtime ships **86 default macros** so contemporary notation works out of the box — bold vectors (`\bv`, `\hatv`), matrices (`\mat`, `\T`, `\inv`, `\hc`), tensors (`\tensor{T}{^a_b}`), vector calculus (`\grad`, `\divv`, `\curl`, `\laplacian`, `\dv`, `\pdv`), quantum (`\bra`, `\ket`, `\braket`, `\matrixel`, `\dyad`, `\comm`), set theory (`\R`, `\Z`, `\C`, `\H`), statistics (`\Var`, `\Cov`, `\rank`, `\tr`), and SI units (`\SI{5}{m/s}`). `<div class="ve-tikz">…</div>` renders arbitrary TikZ via TikZJax — chemfig molecular structures, physics free-body diagrams, thermodynamic Carnot cycles, Venn diagrams, Feynman diagrams, tkz-euclide geometric constructions, anything TikZ can draw. Click any rendered formula or diagram to select the whole thing; **highlight any sub-expression with the mouse** (a variable, an atom, a vector, a region label) to ask the agent about it specifically — the payload includes the highlighted text plus the full source LaTeX so the agent has complete context. Both engines lazy-load from CDN on first use; pages with no math/diagrams pay nothing.

**Semantic geometric regions on TikZ figures.** Declare a JSON sidecar of named regions on a `.ve-tikz` wrapper (`{id: "square-hyp", label: "Square upon the hypotenuse", shape: "polygon", points: …}`) and the runtime overlays invisible hit areas. Click a region → the agent receives the **semantic identity** (`regionId: "incircle"`, not `path[d="…"]`) plus the full TikZ source. The TikZ stays pure LaTeX so the iteration loop — generate figure → click "the square on the hypotenuse" → agent edits just that `\draw …` line → regenerate — produces a final source that pastes straight into the user's LaTeX paper.

**Granular sub-element selection inside math.** 24 macros (`\vecell`, `\veidx`, `\vebound`, `\veterm`, `\veop`, `\vetensor`, …) let the author tag matrix entries, tensor indices, sum/product/integral bounds, Einstein-summed indices, and group-theoretic operators with stable IDs. Each tagged span becomes individually clickable — click "element a₁₂", click "Christoffel index ρ", click "the lower bound of the summation". Naming convention `r1c2` for cell IDs lets the agent compute row/column selections from any single cell click.

**Directed-graph rendering via viz.js (Graphviz, lazy-loaded WASM).** `<div class="ve-graph">DOT source</div>` renders via `dot` (or `neato` / `sfdp` / `circo` / `twopi`) — genuinely the best general-purpose directed-graph layout, with proper minimum-crossings and orthogonal edge routing. Nodes and edges with DOT `id="ve-…"` become semantic selectables. **Math labels are first-class:** any DOT label of the form `$V_1$` or `$\sigma$` is post-processed through KaTeX after the SVG renders, so graph-theory / category-theory / automata papers get proper typeset math inside the SVG (not ASCII). When even `dot` doesn't produce the layout you want, fall back to `.ve-tikz` with manual `\node at (col, row)` placement on an invisible grid plus `data-ve-tikz-regions` for semantic node IDs.

**How the auto-close works.** A small Python runner (`scripts/ve-select.py`) launches Chromium in `--app=URL` mode (a clean borderless window that allows `window.close()`) and blocks until the page POSTs the selection. Tries Chrome → Edge → Brave → Chromium → Vivaldi → Arc; falls back to your default browser with a polite "selection sent — close this tab" overlay if no Chromium-based browser is found. Falls back to a copy-to-clipboard overlay when the page is opened directly via `file://` (no agent runner present).

See [`plugins/visual-explainer/references/interactive-selection.md`](plugins/visual-explainer/references/interactive-selection.md) for the full author's reference (payload schema, Mermaid `click` directive integration, Chart.js wiring, table-form modes, anti-patterns).

## Slide Deck Mode

Any command that produces a scrollable page supports `--slides` to generate a slide deck instead:

```
/diff-review --slides
/project-recap --slides 2w
```

https://github.com/user-attachments/assets/342d3558-5fcf-4fb2-bc03-f0dd5b9e35dc

## How It Works

```
.claude-plugin/
├── plugin.json                    ← marketplace identity
└── marketplace.json               ← plugin catalog
plugins/
└── visual-explainer/
    ├── .claude-plugin/
    │   └── plugin.json            ← plugin manifest
    ├── SKILL.md                    ← workflow + design principles
    ├── commands/                   ← slash commands
    ├── references/                 ← agent reads before generating
    │   ├── interactive-selection.md (click-to-select + table-form modes)
    │   ├── css-patterns.md          (layouts, animations, theming)
    │   ├── libraries.md             (Mermaid, Chart.js, fonts)
    │   ├── responsive-nav.md        (sticky TOC for multi-section pages)
    │   └── slide-patterns.md        (slide engine, transitions, presets)
    ├── templates/                  ← reference templates with different palettes
    │   ├── architecture.html
    │   ├── mermaid-flowchart.html
    │   ├── data-table.html
    │   └── slide-deck.html
    └── scripts/
        ├── ve-select.py             ← local server: opens browser, returns the click
        ├── ve-runtime.js            ← page-side: wires clicks, posts selection
        └── share.sh                 ← deploy HTML to Vercel for sharing
```

**Output:** `~/.agent/diagrams/filename.html` → opens in browser

The skill routes to the right approach automatically: Mermaid for flowcharts and diagrams, CSS Grid for architecture overviews, HTML tables for data, Chart.js for dashboards.

## Limitations

- Generated HTML is portable and self-contained, but auto-opening depends on the harness, browser access, and sandbox rules.
- All harnesses write visual output to `~/.agent/diagrams/` unless the user asks for a different path.
- Switching OS theme requires a page refresh for Mermaid SVGs.
- `/share-page` uses `plugins/visual-explainer/scripts/share.sh`, which expects a Pi-compatible `vercel-deploy` skill in a standard Pi skill location. Other harnesses can still generate and open pages, but sharing may need that dependency installed separately.
- **Auto-close requires a Chromium-based browser.** The `window.close()` API is denied for tabs the browser opened on its own; the runner uses `chrome --app=URL` to get a window that *does* allow close. If no Chromium-based browser is installed, the page still works but the user has to close the tab manually after seeing the "selection sent" overlay.
- **Python 3 is required for the interactive selection runner.** Pre-installed on macOS and most Linux distributions; on Windows, install via `python.org` or WSL.
- Results vary by model capability.

## Credits

Borrows ideas from [Anthropic's frontend-design skill](https://github.com/anthropics/skills) and [interface-design](https://github.com/Dammyjay93/interface-design).

## License

MIT
