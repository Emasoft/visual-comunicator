# Third-party notices

This project's own source code is distributed under the [MIT License](./LICENSE) (Copyright © 2025 Nico Bailon).

In addition, the project ships **vendored copies** and **bundled artefacts** derived from the third-party open-source software listed below. Each entry preserves the upstream copyright notice and licence text as required by the upstream licence.

When the project is redistributed in source form, the licence files referenced below must be redistributed alongside it. When it is redistributed in compiled form (e.g. a single-file bundle), the same notices must accompany the bundle — either as a sibling file or embedded in the bundle's header.

---

## regex-vis

- **Source repository:** <https://github.com/Bowen7/regex-vis>
- **Upstream licence:** MIT
- **Upstream copyright:** Copyright © 2021 Bowen
- **Vendored under:** `plugins/visual-explainer/vendor/regex-vis/`
- **Licence text (verbatim):** [`plugins/visual-explainer/vendor/regex-vis/LICENSE`](./plugins/visual-explainer/vendor/regex-vis/LICENSE)
- **What was copied:** the `parser/`, `atom/`, `graph/`, `editor/`, `utils/`, `components/`, `constants/`, and `playground/` directories of the upstream `src/` tree, plus the upstream `LICENSE` and `README.md`. Tests were stripped from the vendored copy. The runtime entry file `src/ve-regex-entry.tsx` is **NEW** (not from upstream) and licensed under the project's own MIT licence.
- **What was modified:** none of the upstream source has been edited as of the current vendoring pass. Any future modifications will be tracked in `plugins/visual-explainer/vendor/regex-vis/README.md`.
- **Pinned upstream commit:** `main` HEAD as of the vendoring date recorded in `plugins/visual-explainer/vendor/regex-vis/README.md`.

---

If you find a vendored library that is missing from this notice, or whose licence text has drifted out of sync with the upstream, please open an issue.
