# `ve-regex` — Vendored regex visualizer (build source)

This directory holds the **build-time source** for the `ve-regex` component shipped by the `visual-explainer` plugin. It is a vendored copy of [Bowen7/regex-vis](https://github.com/Bowen7/regex-vis) (MIT, see `LICENSE`), trimmed and re-skinned. The full third-party notice for this vendored library is recorded in `THIRD_PARTY_NOTICES.md` at the project root.

**This directory is repo-contributor build material; nothing here ships to plugin end users.** The `npm run build` step below produces a single UMD bundle that gets copied into `plugins/visual-explainer/scripts/ve-regex.umd.js` — that is the only file the plugin distributes. End users never see this `vendor/` directory.

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
cd vendor/regex-vis
npm install                                                  # one-time
npm run build                                                # writes dist/
cp dist/ve-regex.umd.js  ../../plugins/visual-explainer/scripts/
cp dist/ve-regex.css     ../../plugins/visual-explainer/scripts/
cp LICENSE               ../../plugins/visual-explainer/scripts/ve-regex.LICENSE
git add plugins/visual-explainer/scripts/ve-regex.umd.js \
        plugins/visual-explainer/scripts/ve-regex.css \
        plugins/visual-explainer/scripts/ve-regex.LICENSE
```

`vendor/regex-vis/dist/` and `vendor/regex-vis/node_modules/` are gitignored — they're build by-products. Only the three files copied into `plugins/visual-explainer/scripts/` are committed, so the plugin remains drop-in for end users (no `npm install` required at install time).

The plugin runtime (`ve-runtime.js`) lazy-loads `scripts/ve-regex.umd.js` + `scripts/ve-regex.css` from same origin at first sight of a `.ve-regex[data-regex]` element on the page.

## Phase status (TRDD-bdf0)

- [x] Phase 0 — vendor source + LICENSE + skeleton package.json + vite.config + entry point
- [x] Phase 1 — `npm install` and produce the first un-themed UMD bundle. Smoke test green: 484 KB / **151 KB gzipped**, renders the graph SVG correctly. See TRDD §12 for the five build adjustments.
- [x] Phase 2 — Tailwind compiles via PostCSS, theme tokens redefined to the plugin's gold/cream/coffee palette in `src/global.css`. Bundle now ships `ve-regex.css` (30 KB / 6 KB gz) sibling to the UMD. Light + dark mode both verified via dev-browser headless. See TRDD §14.
- [ ] Phase 3 — runtime hook in `ve-runtime.js` for `.ve-regex[data-regex]`, wire edit-panel commit → `kind:"regex-edit"` in `veSelection`
- [ ] Phase 4 — test page `tests_dev/regex-vis-test.html` + cookbook docs

## What changed from upstream

Diff is intentionally minimal. Tracked in this directory as it grows. The `parser/`, `atom/`, `graph/`, `editor/` directories should remain a 1:1 copy of the upstream source so we can re-vendor cleanly when needed (manual diff against the pinned upstream tag).

Pinned upstream commit: latest `main` as of 2026-05-05 (clone done in this session). When re-vendoring, capture the new commit hash here.
