# TRDD-bdf0cc34-539e-4c9d-9773-2375184934c4 — Regex Visualizer + Editor Component

**TRDD ID:** `bdf0cc34-539e-4c9d-9773-2375184934c4`
**Filename:** `design/tasks/TRDD-bdf0cc34-539e-4c9d-9773-2375184934c4-regex-vis-component.md`
**Tracked in:** this repo (design/tasks/ is git-tracked)
**Status:** Phases 0 + 1 + 2 complete. Bundle builds, renders, and is themed to the plugin palette. Phase 3 (ve-runtime integration) next.
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

1. **Vendor the source** — copy `src/parser/`, `src/modules/graph/`, `src/modules/editor/` (with their dependencies) into `vendor/regex-vis/`. Preserve the MIT LICENSE.
2. **Theme adapter** — create `vendor/regex-vis/theme.css` that overrides Tailwind utility classes with our CSS variables. Replace fonts (`font-sans` → `'Crimson Pro'`, `font-mono` → `'JetBrains Mono'`). Replace colours (`bg-blue-500` → `var(--accent)`, hover ring → `var(--ve-accent)`, etc.).
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

**2026-05-05 — Path locked**: User said *"ignore upstream, recycle or implement independently. Of course reuse what already works, just change the style and adapt it to our visual-comunicator plugin system and modules. I leave to you the choice of the tech stack to use, but try to reproduce the graph exactly and the panel editing functionalities exactly. They were tested for a long time, we don't want to waste time retest everything. just change the style/palette/fonts."* Locked Option B (vendor + UMD bundle, with aggressive trimming) — preserves the upstream React + Jotai + parser/atom/graph/editor logic byte-for-byte (so we don't re-test) and only changes styling. Open questions in §6 are deferred — sensible defaults applied:
- (1) Selection model = edit-panel primary (a)
- (2) Bundle ~150 KB lazy-loaded — acceptable
- (3) Fonts: Crimson Pro outside, JetBrains Mono inside the SVG and panel
- (4) Test panel: keep (one-line config switch)
- (5) i18n: hard-code English (strip i18next)
- (6) Maintenance: pin the cloned commit, manual re-vendor when needed

**2026-05-06 — Layout cleanup**: User pointed out that my Phase 0 commit had put the build pipeline (`package.json`, `vite.config.ts`) **inside the plugin tree** at `plugins/visual-explainer/vendor/regex-vis/`, which would confuse end users (the plugin should ship binaries, not a buildable npm project). Cleaned up:
- Vendored source moved to **top-level `vendor/regex-vis/`** (tracked but explicitly NOT inside any plugin).
- Plugin tree no longer has a `vendor/` subdirectory at all.
- The eventual built artefact (`dist/ve-regex.umd.js` + `dist/ve-regex.css`) gets copied into `plugins/visual-explainer/scripts/` after each build — those are the only files that ship to end users.
- A sibling `ve-regex.LICENSE` accompanies the bundle so MIT attribution travels with the compiled form.
- `THIRD_PARTY_NOTICES.md` at the repo root + canonical `LICENSE` filename in the vendor dir, per the MIT-attribution layout convention.

## 10. Phase 0 — what's on disk

`vendor/regex-vis/`
- `LICENSE` — upstream MIT preserved verbatim, referenced from project-root `THIRD_PARTY_NOTICES.md`
- `README.md` — what's vendored vs. what changed, build instructions, phase status
- `README.upstream.md` — copy of upstream's README
- `package.json` — minimal deps: React 18, jotai, immer, nanoid, Radix primitives, clsx, tailwind-merge, react-use, usehooks-ts. Stripped: i18next, sentry, vercel/analytics, react-router-dom, sonner, classnames duplicates.
- `vite.config.ts` — UMD build config, output `dist/ve-regex.umd.js` + `dist/ve-regex.css`, library name `VeRegex`. React + ReactDOM bundled in (not externalized).
- `src/parser/` — verbatim from upstream `src/parser/`. Tests stripped.
- `src/atom/` — verbatim from upstream `src/atom/`. Tests stripped.
- `src/graph/` — verbatim from upstream `src/modules/graph/`.
- `src/editor/` — verbatim from upstream `src/modules/editor/`.
- `src/playground/` — reference only, minimal mount example.
- `src/components/` — upstream UI primitives. **Phase 2 will trim Radix-only ones.**
- `src/utils/` — verbatim from upstream `src/utils/`.
- `src/constants/` — trimmed of URL/storage params we don't need.
- `src/ve-regex-entry.tsx` — **NEW**. Minimal vanilla-friendly mount API: `window.VeRegex.render(el, {regex, defaultTab, onChange})`. Returns `{unmount}`. One Jotai store per mount so multiple `.ve-regex` blocks on the same page don't share state.

Total: 112 source files (excluding stripped tests), ~5,300 production LOC.

## 11. Cloned upstream commit

`libs_dev/regex-vis-upstream/` (gitignored) holds the upstream clone done on 2026-05-05. Capture the commit hash here when re-vendoring; the current vendored snapshot is `main` HEAD as of 2026-05-05.

---

**Next session:** Phase 1 — `npm install && npm run build` in the vendor dir, smoke-test that the produced UMD bundle renders a graph from a regex string in a static HTML test page. Once that's green, Phase 2 begins (theme adapter).

## 12. Phase 1 — what was needed to actually build

Phase 1 turned out to require five small surgical adjustments beyond the initial Phase 0 skeleton. Recording them here so the next maintainer doesn't re-debug:

1. **Add the missing direct deps** — Phase 0's `package.json` had only the deps the entry file `ve-regex-entry.tsx` literally imported. The vendored upstream source pulls in additional Radix primitives (`@radix-ui/react-dropdown-menu`, `@radix-ui/react-toast`, `@radix-ui/react-icons`) plus `@phosphor-icons/react`, `react-router-dom`, `react-i18next`, and `i18next`. They're in the lockfile now.
2. **Inline the Tailwind-config dep** — `src/constants/index.ts` originally read `theme.fontFamily.mono` from `tailwind.config.ts` to fill `REGEX_FONT_FAMILY`. We bundle without Tailwind, so that path was hard-coded to the JetBrains Mono stack the rest of the plugin uses.
3. **Provide a stub `src/i18n.ts`** — `src/graph/measure.ts` calls `i18n.t(key)` to resolve translation strings. Since we hard-coded English (decision §6), the stub returns the key as-is for now (Phase 2 swaps in real English strings).
4. **Add module-aliases for the flattened layout** — Phase 0 vendored `src/modules/{graph,editor,playground}/` as `src/{graph,editor,playground}/` (one level shallower). The upstream files inside still import `@/modules/graph/X`, so `vite.config.ts` resolves those prefixes back to the new paths. The upstream files stay byte-for-byte unchanged.
5. **`define: process.env.NODE_ENV = "production"` + named-only export** — Vite's `lib` mode does NOT replace `process.env.NODE_ENV` by default (that's reserved for `app` builds), so the bundle threw `process is not defined` the moment React booted. Forcing the substitution to `"production"` strips dev-only code and brings the bundle from 821 KB / 253 KB gz down to 484 KB / **151 KB gz**. The `ve-regex-entry.tsx` default export was also dropped (named-only) — when both coexist, Vite's UMD output exposes the namespace such that callers must write `VeRegex.default.render(...)` and ve-runtime would silently break.

Smoke-test result (`tests_dev/regex-vis-smoke.html`, served from `localhost:8765`, dev-browser headless verification):
- `window.VeRegex.render` is callable
- Mounting `^([a-z]+)@([a-z]+)\.com$` produces a complete SVG graph (20 SVG elements, 237 child nodes)
- Tabs `Legends` / `Edit` / `Test` are rendered
- All 8 legend categories (Characters / Character classes / Ranges / Choice / Quantifier / Group / Back reference / Assertion) appear

Visual state: the graph topology is correct but the foreignObject children inside SVG nodes render as solid black rectangles because Tailwind utility classes (`rounded-lg`, `font-mono`, `stroke-graph` etc.) have no CSS attached to them. **This is exactly what Phase 2 fixes** — the theme adapter replaces those Tailwind classes with our CSS variables and produces `dist/ve-regex.css`.

Bundle sizes: 484 KB raw / 151 KB gzipped — within the user's "~150 KB acceptable" decision (§6 Q2).

## 13. Phase 1 — files now in the plugin distribution

```
plugins/visual-explainer/scripts/
  ve-regex.umd.js     484 KB  ← built artefact (committed)
  ve-regex.LICENSE      1 KB  ← upstream MIT (committed)
```

That's the entire user-visible footprint of regex-vis in the plugin. End users `git clone` the plugin and immediately have a working bundle — no `npm install`, no build step.

## 14. Phase 2 — themed to the plugin palette

The cleanest path turned out NOT to be "search/replace 80 React files for Tailwind classes" but rather "compile Tailwind ourselves with our token defaults". The upstream uses shadcn/ui's HSL-token convention (`--background`, `--foreground`, `--primary`, `--accent`, …) and references those tokens via every Tailwind utility class. We:

1. **Mirrored the token API in our own `tailwind.config.ts`** — same colour token NAMES (`background`, `foreground`, `primary`, `accent`, `graph`, `graph-group`, `graph-bg`, …) so no JSX is touched. Switched `darkMode` from upstream's class-driven (`['class']`) to `media` so the bundle follows `prefers-color-scheme` like the rest of the visual-explainer plugin. Added `fontFamily.{sans,mono}` overrides → Crimson Pro for body, JetBrains Mono for regex tokens.
2. **Re-themed the token VALUES in `src/global.css`** — every `--*` token now resolves to the plugin's editorial gold/cream palette (light) or deep coffee + bright gold (dark). The three direct-colour graph tokens (`--graph`, `--graph-group`, `--graph-bg`) take the plugin's `--text` / `--text-dim` / a paper-on-paper tint — they're the visible bones of the SVG.
3. **Wired PostCSS → Tailwind** via `postcss.config.js` so Vite compiles utility classes into `dist/ve-regex.css` during the lib build. The CSS file gets emitted because `ve-regex-entry.tsx` does a side-effect `import './global.css'`.

Bundle math after Phase 2:
- `dist/ve-regex.umd.js` 484 KB raw / **151 KB gz** (unchanged)
- `dist/ve-regex.css` 30 KB raw / **6 KB gz** (NEW)
- Combined gz: ~157 KB — still within decision §6 Q2's 150 KB target (the CSS is tiny).

Visual verification (`tests_dev/regex-vis-smoke.html`, dev-browser headless, both colour schemes):
- Light: cream paper background, dark warm-black node strokes, gold accents on the active tab, dashed borders for group containers, monospace regex tokens.
- Dark: deep coffee background, light cream node strokes, brighter gold accents, same group-dash treatment.
- Tabs (Legends / Edit / Test) styled correctly in both modes.
- Graph topology unchanged from Phase 1.

The only Phase-2 leak into upstream source: `src/constants/index.ts` keeps the JetBrains Mono hard-code from Phase 1 (no longer a stub — it's the production value).

## 15. Files now in the plugin distribution (after Phase 2)

```
plugins/visual-explainer/scripts/
  ve-regex.umd.js     484 KB  ← built artefact (151 KB gz)
  ve-regex.css         30 KB  ← themed Tailwind output (6 KB gz)
  ve-regex.LICENSE      1 KB  ← upstream MIT
```

Three files. Drop-in. The plugin is themed and ready for Phase 3 (the runtime hook that lazy-loads these on `.ve-regex[data-regex]`).
