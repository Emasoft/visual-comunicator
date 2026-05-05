# `ve-regex` — Vendored regex visualizer

This directory holds a **vendored copy** of [Bowen7/regex-vis](https://github.com/Bowen7/regex-vis) (MIT, see `LICENSE`), trimmed and re-skinned for the `visual-explainer` plugin. The full third-party notice for this vendored library is recorded in `THIRD_PARTY_NOTICES.md` at the project root.

The goal: drop-in regex graph + edit-panel that the plugin lazy-loads on any page containing `<div class="ve-regex" data-regex="...">`. Same render pattern as KaTeX / viz.js / TikZJax / Mermaid in `ve-runtime.js`.

## What's here

| Path | Origin | Status |
|---|---|---|
| `src/parser/` | upstream `src/parser/` | **untouched** — regex string ↔ AST. Tests stripped, code left alone. |
| `src/atom/` | upstream `src/atom/` | **untouched** — Jotai atoms for AST mutation, selection, undo/redo. Tests stripped. |
| `src/graph/` | upstream `src/modules/graph/` | **untouched** — AST → SVG renderer + measure layout. |
| `src/editor/` | upstream `src/modules/editor/` | **untouched** — side-panel features (insert/group/quantifier/look-around/content). |
| `src/playground/` | upstream `src/modules/playground/` | reference only — minimal mount example. |
| `src/components/` | upstream `src/components/` | **TODO Phase 2** — strip Radix UI dependencies, replace with native HTML where possible. |
| `src/utils/` | upstream `src/utils/` | **untouched** — drag-select, copy-to-clipboard, hooks. |
| `src/constants/` | upstream `src/constants/` | trimmed — URL params and storage keys we don't need are removed. |
| `src/ve-regex-entry.tsx` | **NEW** | minimal Vanilla-friendly mount API (`window.VeRegex.render(el, options)`). |
| `package.json`, `vite.config.ts` | **NEW** | builds a single UMD bundle (`dist/ve-regex.umd.js`) + standalone CSS. |
| `LICENSE` | upstream `LICENSE` | preserved verbatim per MIT requirements (also referenced from project-root `THIRD_PARTY_NOTICES.md`). |

What's intentionally NOT vendored from upstream: `App.tsx`, `routes.tsx`, `index.tsx`, the `home/` module, Sentry/Vercel analytics wiring, `i18n.ts` + `react-i18next` integration. We use English only and don't need URL routing.

## Build (next session)

```bash
cd plugins/visual-explainer/vendor/regex-vis
npm install
npm run build
# -> dist/ve-regex.umd.js  + dist/ve-regex.css
```

The output goes into `dist/`. The plugin runtime lazy-loads it at first sight of a `.ve-regex[data-regex]` element.

`dist/` is gitignored by default (rebuildable from source) but the **finished bundle files** (`dist/ve-regex.umd.js` + `dist/ve-regex.css`) are explicitly force-added with `git add -f` after each meaningful build, so the plugin remains drop-in for end users (no `npm install` required at install time). After a vendored-source change, re-run `npm run build` and `git add -f dist/ve-regex.umd.js dist/ve-regex.css` to update the committed bundle.

## Phase status (TRDD-bdf0)

- [x] Phase 0 — vendor source + LICENSE + skeleton package.json + vite.config + entry point
- [ ] Phase 1 — `npm install` and produce a first un-themed UMD bundle (smoke test)
- [ ] Phase 2 — theme adapter: replace Tailwind classes with our CSS vars, swap fonts to Crimson Pro / JetBrains Mono
- [ ] Phase 3 — runtime hook in `ve-runtime.js` for `.ve-regex[data-regex]`, wire edit-panel commit → `kind:"regex-edit"` in `veSelection`
- [ ] Phase 4 — test page `tests_dev/regex-vis-test.html` + cookbook docs

## What changed from upstream

Diff is intentionally minimal. Tracked in this directory as it grows. The `parser/`, `atom/`, `graph/`, `editor/` directories should remain a 1:1 copy of the upstream source so we can re-vendor cleanly when needed (manual diff against the pinned upstream tag).

Pinned upstream commit: latest `main` as of 2026-05-05 (clone done in this session). When re-vendoring, capture the new commit hash here.
