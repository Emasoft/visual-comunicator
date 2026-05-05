# TRDD-bdf0cc34-539e-4c9d-9773-2375184934c4 — Regex Visualizer + Editor Component

**TRDD ID:** `bdf0cc34-539e-4c9d-9773-2375184934c4`
**Filename:** `design/tasks/TRDD-bdf0cc34-539e-4c9d-9773-2375184934c4-regex-vis-component.md`
**Tracked in:** this repo (design/tasks/ is git-tracked)
**Status:** Not started — awaiting design approval
**Created:** 2026-05-05
**Plugin:** visual-explainer

## 1. Original user request (verbatim)

> also add this component (extracting the source code for both the view in html of a regular expression graph and the edit panel when selecting any element of the graph to edit it, including all options but also adapting it to our graphics style/theme/fonts/etc. https://github.com/Bowen7/regex-vis

## 2. Upstream survey

`Bowen7/regex-vis` — MIT-licensed, TypeScript, ~80 KB+ of source.

| Path                          | Files | Size  | Role |
|-------------------------------|------:|------:|------|
| `src/parser/`                 | 13    | ~30 KB| Regex string → AST (lexer + parser + visitors) |
| `src/modules/graph/`          | 17    | ~38 KB| AST → SVG graph (nodes / quantifiers / connectors) |
| `src/modules/editor/`         | 5+features | ~17 KB| Edit panel: appears on node click, mutates AST, regenerates string |
| `src/atom/`, `src/utils/`     | —     | ~10 KB| Jotai atoms for state, helpers |

Tech stack:
- React 18 + Vite + Tailwind CSS + Jotai (atomic state)
- Custom regex parser (NOT `regexp.tree` / standard libraries)
- SVG-based rendering (D3-ish layout via `measure.ts`)
- i18n via `i18next`
- Component library: shadcn/ui (Radix + Tailwind)

Demo at `https://regex-vis.com`.

## 3. Why this is non-trivial

The visual-explainer plugin generates **single-file HTML pages** that load `ve-runtime.js` (vanilla JS, ~85 KB, no build step) and render via lazy-loaded WASM/CDN dependencies (Mermaid, viz.js, KaTeX, TikZJax). Adding regex-vis means producing a similar drop-in component:

```html
<div class="ve-regex" data-regex="^(\d{3})-(\d{4})$"></div>
<script src="ve-runtime.js"></script>
```

…that renders the graph, opens the edit panel on click, integrates with multi-select, and matches our gold/serif theme.

The challenges:

1. **Build pipeline mismatch.** regex-vis is React+Vite. The visual-explainer runtime is a single hand-written JS file with no build step. We either bring in a build pipeline (now we have a transpilation step in the plugin) or rewrite in vanilla JS.
2. **Bundle size.** React + ReactDOM + the regex-vis source ≈ 200 KB minified. Our largest WASM dependency (TikZJax) is 3 MB but loads lazily. A 200 KB always-loaded React bundle on every page is a regression.
3. **State model collision.** regex-vis uses Jotai atoms for the AST and selection state. Our runtime uses a single `veSelection` array. Either we run two state systems in parallel or we port the atoms to vanilla.
4. **Styling.** Tailwind classes are everywhere in regex-vis JSX. Our pages use CSS custom properties (`--gold`, `--accent`, `--text`, `--ve-accent`) and Crimson Pro / JetBrains Mono fonts. Tailwind's reset (`@tailwind base`) would clobber our typography.
5. **Edit panel interaction.** regex-vis edit panel is a side panel that mutates the AST and re-renders the graph + the regex string. Hooking that into our multi-select system (`kind: "regex-edit"` entries? or a separate workflow?) is a design question.
6. **License attribution.** MIT requires keeping the copyright notice. We need to ship it inside the bundle or in a sibling file.

## 4. Implementation options

### Option A — Iframe embed (1 day)

```html
<iframe class="ve-regex" src="https://regex-vis.com/?r=…" sandbox="allow-scripts"></iframe>
```

- ✅ Zero bundling work.
- ✅ Always up-to-date with upstream.
- ❌ NOT themed (light theme, sans-serif, generic).
- ❌ NO integration with `veSelection` (clicks stay inside the iframe).
- ❌ Requires network access (regex-vis.com); no offline use.
- ❌ Privacy concern — the user's regex is sent to a third-party server.

**Verdict:** Fails the user's "adapt to our style" requirement. Not viable.

### Option B — Pre-compiled UMD bundle, themed (3-5 days)

Vendor the source, replace Tailwind with our CSS variables, build a UMD bundle that exposes a global like `VeRegex.render(el, options)`. Ship as a sibling file `ve-regex.bundle.js` (~200 KB), lazy-loaded only when the page contains `.ve-regex`.

- ✅ Self-contained, offline, themed.
- ✅ Source code is auditable (lives in the plugin repo).
- ✅ Lazy-load means non-regex pages pay zero cost.
- ⚠️ Requires a one-time Vite/Rollup build setup in the plugin.
- ⚠️ Upstream upgrades require a manual re-vendor step.

**Verdict:** Recommended. Aligns with the existing lazy-load pattern (Mermaid, viz.js, TikZJax all lazy-load).

### Option C — Vanilla rewrite (2-4 weeks)

Reimplement the parser + graph + editor in vanilla JS, dropping React/Tailwind/Jotai. Output is a single ~30 KB self-contained module integrated into `ve-runtime.js`.

- ✅ Smallest footprint, deepest integration with `veSelection`.
- ❌ 2-4 weeks of work for one feature.
- ❌ We lose upstream bugfixes and feature additions.
- ❌ Risk of subtle parser divergences from the upstream regex semantics.

**Verdict:** Not worth it unless we plan to extend regex-vis significantly beyond upstream.

### Option D — Hybrid: vanilla parser + ported renderer (1-2 weeks)

Port `src/parser/` (no React, just text → AST) to vanilla JS. Reuse the AST → SVG renderer logic but as vanilla DOM. Skip the Jotai atoms and use our `veSelection`. Edit panel as a vanilla popup.

- ✅ ~50 KB total, fully integrated, themed.
- ⚠️ Parser is the most complex part of the upstream — significant porting effort.
- ⚠️ Need to keep test parity with upstream regex semantics.

**Verdict:** Reasonable middle ground if Option B's bundle size is unacceptable.

## 5. Recommended path: Option B

Steps:

1. **Vendor the source** — copy `src/parser/`, `src/modules/graph/`, `src/modules/editor/` (with their dependencies) into `plugins/visual-explainer/vendor/regex-vis/`. Preserve the MIT LICENSE.
2. **Theme adapter** — create `plugins/visual-explainer/vendor/regex-vis/theme.css` that overrides Tailwind utility classes with our CSS variables. Replace fonts (`font-sans` → `'Crimson Pro'`, `font-mono` → `'JetBrains Mono'`). Replace colours (`bg-blue-500` → `var(--accent)`, hover ring → `var(--ve-accent)`, etc.).
3. **Bundle config** — set up Vite in the vendored directory to produce `dist/ve-regex.umd.js` and `dist/ve-regex.css` as standalone bundles. Externalize React only if we can guarantee a CDN React is loaded; otherwise inline it.
4. **Runtime hook** — extend `ve-runtime.js`:
   - Detect `.ve-regex[data-regex]` elements at init.
   - Lazy-load `ve-regex.umd.js` + `ve-regex.css` from same origin.
   - Mount the React component into the wrapper div.
   - Wire the edit panel close → emit a `regex-edit` selection entry into `veSelection` so the agent receives `{kind: "regex-edit", original: "<old>", edited: "<new>", ast: {...}}`.
5. **Test page** — `tests_dev/regex-vis-test.html` with several regex examples (simple, capturing groups, lookahead, character classes, quantifiers).
6. **Cookbook + SKILL.md** — document the `<div class="ve-regex" data-regex="…">` pattern and the new selection kind.

## 6. Open questions for the user

1. **Selection integration** — when the user clicks a node in the regex graph, do we:
   (a) open the edit panel inline (regex-vis behaviour), and emit `kind:"regex-edit"` only after they confirm the edit?
   (b) toggle the node into `veSelection` like other elements (`kind:"regex-node"`), and the edit panel is only opened by a "Edit" button on the panel?
2. **Bundle size budget** — is ~200 KB always-loaded acceptable for pages that use `.ve-regex`? Or should we lazy-load only when the page contains the class (recommended)?
3. **Fonts** — Crimson Pro for regex labels feels wrong (regex tokens should be monospace). Use JetBrains Mono everywhere inside the graph, Crimson Pro only for the surrounding caption?
4. **Test panel** — regex-vis includes a "test" tab where the user can paste sample text and see matches. Include this, or strip it (one less feature, smaller bundle)?
5. **i18n** — regex-vis uses i18next. Strip and hard-code English? Or wire it to `<html lang>` like the multi-click locale system?
6. **Maintenance** — when upstream releases a new version, do we re-vendor manually (risky, manual diff) or pin a tag and never auto-upgrade (safer, miss bugfixes)?

## 7. Phased build plan (after design approval)

| Phase | Scope | Days |
|------:|-------|-----:|
| 1     | Vendor the source + LICENSE; basic Vite build producing UMD; smoke test in tests_dev/ | 1 |
| 2     | Theme adapter — replace Tailwind classes with our CSS vars; map all colours / fonts / spacing | 2 |
| 3     | Runtime hook — `.ve-regex[data-regex]` detection + lazy load + mount + theme injection | 1 |
| 4     | Selection integration — wire edit-panel commit → `veSelection` entry with `kind:"regex-edit"` | 1 |
| 5     | Cookbook + SKILL.md docs + agent response patterns for the new selection kind | 0.5 |
| 6     | Test page with 5–10 representative regex examples; CDP verification of all interactions | 0.5 |

Total: ~6 days at one feature per session.

## 8. Out of scope (intentionally deferred)

- Custom regex flavours (PCRE, RE2, Ruby) — upstream supports only JS regex.
- Save/load — ephemeral session, no persistence.
- Multiple regex graphs on the same page — supported but each gets its own state silo.
- Inline regex testing against live data files — would require a runner extension; future work.

## 9. Decision log

(To be appended as design questions are answered.)

---

**Awaiting:** user approval of (a) Option B as the implementation path and (b) the open-question recommendations in §6, then phase 1 vendoring begins.
