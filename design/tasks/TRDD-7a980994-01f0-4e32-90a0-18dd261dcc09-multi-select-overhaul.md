# TRDD-7a980994-01f0-4e32-90a0-18dd261dcc09 — Multi-Select + Submit + Granular-Click + Handles Overhaul

**TRDD ID:** `7a980994-01f0-4e32-90a0-18dd261dcc09`
**Filename:** `design/tasks/TRDD-7a980994-01f0-4e32-90a0-18dd261dcc09-multi-select-overhaul.md`
**Tracked in:** this repo (design/tasks/ is git-tracked)
**Status:** Not started — awaiting phase 1 approval
**Created:** 2026-05-04
**Plugin:** visual-explainer

## 1. Original user request (verbatim)

> I realized the user may want to select MULTIPLE items before submitting. So from now on the standard should be to have to press a submit button (called exit if nothing is selected, and submit if something is selected) to close the window. And multiple selection must be possible. The user will select/unselect everything he touches (except text). For example he clicks on a node, it highlight, then he click on an edge, it highlight, then on another node, it highlight, but if he click again on the edge, it removes the highlight, etc. He can select/deselect how many things he wants. Then press submit to send the list of selected things to claude. For text or expressions instead it still must drag the mouse cursor to select the text. But you can add this shortcut:
> - one click (no drag): select the exact letter/symbol/variable
> - double click (=second click within a time interval): select the entire word (all symbols not divided by space or operators/parentheses/comma/etc.)
> - triple click: select the entire block of text stopping at spaces or brackets or operators, but not on comma or dots (for example `10,000,000.00` will be selected whole, but beware of languages where dots an comma are inverted in numbers. in italian it will be `10.000.000,00`).
> - quadruple click: select entire paragraph or sub-expression (stops at textual stop dots, not floating points).
> - quintuple click: whole section/column/row select, stopping at new lines, at list rows, at table single row, etc. (to select columns instead, you must use the handles, see below..)
> - sixtuple click: select the whole chapter, whole table, whole text inside a node
> - septuple click: select ALL text on the page, no matter where it is.
>
> The handles system: when hovering on any table, some small handles will appear on the left and right of each row you are hovering on, and above and below of the column you are overing on, including some extra space outside of the table row or column as the area triggering the hovering handles, like an invisible extra cell above/below the column and left/right of the row. This handle will be small but button like in shape, enough to suggest it can be clicked on. if clicked it will select the whole row (for left/right rows handles) or the whole column (for above/below columns handles), and it will appear in 'pressed' state, like a switch, so it is clear that it can be pressed again to deselect the row/column. You can select multiple columns and multiple rows at will, independently. Cells at intersection will be selected too (the message to claude would only say: column 8 selected, row 7 selected, etc.). No matter what the user clicks on, selected rows and selected columns will stay selected and won't be deselected until the user clicks again on the handle.
>
> NOTE: important rules:
> - pressing esc will deselect all.
> - text selection is persisting on all text. multiple words can be selected. to deselect a word, you must select it again. the second time you select the same string/letter it will be deselected. selecting text will add the text to the selected elements list (you can have mixed selection), and you can select multiple strings of text. The multi-click selection instead is different: if letters or words are selected again, they will stay selected, they will not deselect. Only the drag selection will deselect things already selected.
> - in case of source code, the line number must always be shown, and act as an handler. in other words: if the number is clicked, the whole line of code is selected, if clicked again is deselected. dragging the mouse pressing the button on the numbers will select all the numbers the mouse is passing on. going back will deselect them, keeping the interval between the first line selected and the one where the mouse is now all selected. as for multi-clicks, reselecting an interval of lines will add to selection, never deselect. to deselect you need to click the individual numbers. double click on a number will select all the lines. triple click will deselect all the lines.
>
> IMPORTANT NOTE ON TOUCH BROWSERS COMPATIBILITY: if a touch/mobile browser is detected, the finger dragging will be used instead, as the tap/double tap, etc.

## 2. Why this is non-trivial

Today every click is final: the runtime POSTs immediately and `window.close()`-es. Every layer of the system assumes a single-selection contract. This redesign changes:

- **Runtime selection model** — `Set<SelectionEntry>` instead of single `entry → POST` flow
- **Wire format / payload schema** — POST body becomes `{selections: [...]}` instead of `{id, type, label, data}`
- **Submit/Exit UI** — new floating button bar with state-dependent label
- **Visual highlight states** — selected vs hover, persistent vs transient, handle pressed-state
- **Click semantics** — toggle on selectable elements, but ADD-ONLY for multi-click text + line-number drag (different from drag-text-selection which deselects)
- **Click counter / debouncer** — needs a 7-level click counter with timeout (~500 ms) and a "tier vocabulary" per element type (math, prose, table, code, graph)
- **Granular text-selection grammars** — different word/block/paragraph boundaries per content type (math, prose, code, numeric literal with locale-aware thousands separator)
- **Handles overlay** — invisible extended hit zones around table rows/columns, popup buttons on hover, toggle state
- **Code line-number gutter** — clickable, draggable, with multi-stage click semantics (1=line, 2=all lines, 3=clear-all-lines)
- **Touch / pointer events** — replicate every gesture for finger input
- **ESC global listener** — clear all selections
- **Agent-side response patterns** — claude must read a list, not a single item

Estimated runtime growth: +800 to +1500 LOC. Cookbook + SKILL.md updates: ~200 LOC. New TRDD-tracked tests for each click depth and each handle path.

## 3. Spec (normative)

### 3.1 Global selection model

A single `Set<SelectionEntry>` lives on `window.veSelection` (and is persisted nowhere else — refresh wipes it). Each entry has:

```ts
type SelectionEntry =
  | {kind: 'element',   id: string, type: string, label: string, data?: any}   // graph node, edge, chart point, mermaid node, card, etc.
  | {kind: 'text',      text: string, source: string, anchor?: {paragraphId?, lineNo?, cellRef?}}
  | {kind: 'row',       table: string, row: number}
  | {kind: 'column',    table: string, col: number, header?: string}
  | {kind: 'codeline',  block: string, line: number}
  | {kind: 'codelines', block: string, fromLine: number, toLine: number}
```

Every entry carries a stable `entryId` (sha-1 of its content) so add/remove via toggle is O(1) and idempotent.

### 3.2 Submit/Exit button bar

- **Two physical buttons**, mirroring each other so the user can reach one without travelling across the viewport: one fixed at **top-right** (next to the zoom controls) and one fixed at **bottom-left**. They share state, label, and keyboard shortcut. Click on either → same outcome.
- Two states: when `veSelection.size === 0` → label is **"Exit"** (light grey button), when ≥1 → label is **"Submit"** (accent colour) plus a small badge with the count
- Click → POSTs `{kind:'submit'|'exit', selections: [...]}` → `window.close()` (or fallback overlay)
- Always present whenever the runtime is wired (not just when something is selected)
- Keyboard shortcut: **Enter** triggers Submit/Exit **globally** — no focus required, fires from anywhere on the page. (Edge case: if focus is in a `<input type="text">`, Enter still goes to the input first; it triggers Submit only if the input doesn't capture the event, which it always will. Acceptable.)

### 3.3 Element selection (graph nodes/edges, chart points, mermaid nodes, ve-cards, etc.)

- 1 click = toggle membership in `veSelection` (add if absent, remove if present)
- Visual: **hover and selected use the SAME accent colour** (gold by default, page-CSS-overridable via `--ve-accent`) so the user always sees one consistent "this is the highlight colour" signal. The two states are distinguished by the **glow effect**:
  - **Selected** (persistent, via `[data-ve-selected="1"]`) — solid gold stroke / outline, NO glow
  - **Hover** (transient, via `:hover`) — same gold stroke / outline PLUS a soft glow (`filter: drop-shadow(0 0 6px var(--ve-accent))`)
  - When an element is BOTH selected and hovered → solid gold + glow (i.e. the glow is additive on hover regardless of selection)
- ESC deselects every element entry

### 3.4 Text selection — multi-click

Click counter logic: track `clickCount` per click target with a 500 ms debounce. After every click, schedule a 500 ms timer; the next click within that window increments `clickCount`. When the timer fires, apply the action for `clickCount` and reset.

Per-content-type vocabularies (boundary detector functions in `ve-runtime.js`):

| Click depth | Plain prose                  | Math (`.ve-math`)               | Code (`pre/code`)            |
|------------:|------------------------------|---------------------------------|------------------------------|
| 1           | letter/symbol/whitespace token | single variable / atom         | single character             |
| 2           | word (alpha+digit run)       | identifier / function name      | identifier / keyword         |
| 3           | text block stopping at space/bracket/operator, **NOT** comma/dot inside numbers (locale-aware: `10,000.00` US, `10.000,00` IT, `1 000,00` FR) | sub-expression (matched parens/brackets) | statement (until `;` or end-of-line) |
| 4           | paragraph (stop at `.`, `?`, `!` followed by space, but NOT inside floats like `3.14`) | top-level sub-expression       | block (`{...}` or indent block in Python) |
| 5           | section / list-item / table cell (stop at newline / `<li>` / `<td>`) | full numerator-or-denominator / matrix row | function body                |
| 6           | chapter / whole table / whole node text | whole formula                  | whole class / module         |
| 7           | ALL text on page             | ALL math on page                | ALL code on page             |

Locale detection: read **`<html lang>` ONLY** — `navigator.language` is unreliable on Safari mobile (per user feedback) and is therefore deliberately not consulted. If `<html lang>` is missing OR not in any recognized list below, fall back to **US format** (`,` thousand, `.` decimal). Map `it`, `de`, `nl`, `da`, `nb`, `pt`, `pl`, `tr`, `vi`, `id`, `is`, `el`, `ru`, `uk`, `bg`, `hr`, `cs`, `hu`, `lv`, `mk`, `ro`, `sk`, `sl`, `bs`, `mt`, `sr` → European format (period thousand sep, comma decimal). Map `fr`, `fi`, `et`, `lt`, `sv` → space-or-NBSP thousand sep, comma decimal.

Multi-click selections **never deselect** on re-click — they always add. To deselect a text selection, the user must drag-select the same range.

### 3.5 Text selection — drag

Standard browser drag still works. On `mouseup` after a drag, the highlighted range is captured:

- If the range exactly matches an existing `kind:'text'` entry → REMOVE it (deselect)
- Otherwise → ADD a new entry

This is the ONLY path that can DESELECT a text entry.

### 3.6 Tables — row/column handles

For every `<table>` reached by the prose / table-form scanner, the runtime adds a hover overlay:

- Hover anywhere on a row → a small `◀` handle appears 14 px to the left of the row and a `▶` handle 14 px to the right. The hit-zone for the handle includes a 24 px-wide phantom column outside the table.
- Hover anywhere on a column → a small `▼` handle appears 14 px above the column header and a `▲` handle 14 px below the last cell. Hit-zone same — 24 px-tall phantom row.
- Click any of the four handles → toggles a `kind:'row'` or `kind:'column'` entry. Handle paints in "pressed" state (filled background, depressed shadow).
- Multiple rows + multiple columns are independent; intersection cells are NOT separate entries (the agent reads "rows X,Y + columns A,B" and reasons about the intersection itself).
- Clicking individual cells does NOT deselect the row/column — that requires re-clicking the handle.

### 3.7 Source-code line-number gutter

Every `<pre><code>` block (or any element with `class="ve-code"`) gets a left-side gutter with line numbers:

- Numbers are clickable. 1 click = toggle `kind:'codeline'` for that line.
- Drag from line N to line M (mouse-down on N, drag through numbers, release on M) selects the inclusive interval as a `kind:'codelines'` entry.
- Dragging back over already-selected lines DESELECTS them (this is the one place where drag deselects, mirroring text drag).
- Re-selecting an interval that overlaps existing lines ADDS — never deselects.
- Double-click any line number → select all lines as one `kind:'codelines'` spanning the whole block.
- Triple-click any line number → clear all `codeline`/`codelines` entries for that block.

### 3.8 ESC

Global keydown listener: ESC → `veSelection.clear()`, repaint all `[data-ve-selected]` markers, repaint all handle pressed-states. **Does NOT touch form-mode tables** — checkboxes and radio buttons (Mode B / Mode C tables) keep whatever the user typed/clicked, because that's a separate input paradigm. Does NOT close the window. To close, the user clicks Exit/Submit.

### 3.9 Touch / mobile

Detect via `'ontouchstart' in window || navigator.maxTouchPoints > 0`.

- All `click` handlers also fire on `tap` (already true via standard event mapping).
- Multi-click counter accepts taps within 500 ms.
- Drag-text-select uses `touchstart` + `touchmove` + `touchend` — synthesise a `Range` from the start and end touch coordinates via `document.caretPositionFromPoint`.
- Line-number gutter drag: identical, just `touch*` events.
- Handles are bigger on touch devices (32 px hit-zone instead of 24 px).
- ESC equivalent: a small "Clear all" floating button next to Submit/Exit that appears whenever `veSelection.size > 0` and only on touch devices.

### 3.10 Wire format

**New POST body** to `/__ve-select`:

```json
{
  "kind": "submit",                      // or "exit"
  "count": 3,
  "selections": [
    {"kind": "element",  "id": "ve-node-H",       "type": "graph-node", "label": "HUMAN"},
    {"kind": "element",  "id": "ve-edge-H-to-E",  "type": "graph-edge", "label": "H->E"},
    {"kind": "text",     "text": "may send freely", "source": "legend", "anchor": {"paragraphId": null}},
    {"kind": "row",      "table": "perm-matrix",  "row": 4, "header": "MAINTAINER"},
    {"kind": "column",   "table": "perm-matrix",  "col": 2, "header": "ARCHITECT"},
    {"kind": "codelines","block": "ve-code-1",    "fromLine": 12, "toLine": 18}
  ]
}
```

**Backwards compat / runner**: ve-select.py prints the JSON unchanged. Existing single-selection callers will see `selections` arrays of length 1 instead of the old flat `{id, type, label, data}`. Per CLAUDE.md "no backwards compat", we cut over cleanly — there is exactly one wire format from this point.

### 3.11 Agent response patterns

Update SKILL.md "Required follow-up after a selection" to read from `selections[]`. Examples:

- 1 element → "You selected `<label>`. What do you want me to do about it?" (today's behaviour)
- 2-N elements → "You selected N items: `<label>`, `<label>`, … . What should I do with them?"
- exit (count=0) → close politely without prompting
- submit with mixed kinds → list grouped by kind ("3 graph edges, 1 text snippet, 1 row of the permission matrix")

## 4. Phased build plan

Each phase is its own commit + cookbook update + test. Phase N+1 starts only after Phase N is approved.

| Phase | Scope | Files                                                         | Estimated LOC |
|------:|-------|---------------------------------------------------------------|--------------:|
| 1     | Multi-select backbone for ELEMENTS only (graph nodes/edges, ve-cards, mermaid nodes). Submit/Exit button. ESC to clear. New wire format. | ve-runtime.js, ve-select.py (payload print), SKILL.md, references/interactive-selection.md | ~300 |
| 2     | Multi-click text selection (1-3 clicks: letter/word/block) for prose, with locale-aware numeric grammar | ve-runtime.js, references/interactive-selection.md | ~250 |
| 3     | Multi-click extension to depths 4-7 (paragraph/section/chapter/all) + math + code grammars | ve-runtime.js, references/interactive-selection.md | ~250 |
| 4     | Drag text selection that toggles existing entries | ve-runtime.js | ~100 |
| 5     | Table row/column handles | ve-runtime.js, references/interactive-selection.md | ~200 |
| 6     | Code line-number gutter (click toggle, drag interval, double-click=all, triple-click=clear) | ve-runtime.js, references/interactive-selection.md | ~250 |
| 7     | Touch / mobile compatibility for every above gesture | ve-runtime.js | ~150 |
| 8     | Test suite — one test page per content type covering every selection path; update tests_dev with regression fixtures | tests_dev/*.html | ~500 |

## 5. Test scenarios per phase

(Filled in as each phase opens a sub-TRDD.)

## 6. Open questions for the user

| # | Question | User decision |
|---|----------|---------------|
| 1 | Submit button position | **TOP-RIGHT and BOTTOM-LEFT (both)** — two mirrored buttons, shared state |
| 2 | Visual style of selected vs hover | **Same accent colour** (gold) for both. Hover adds a soft glow (`drop-shadow`); selected has no glow. Hover-on-selected = both. |
| 3 | Submit-on-Enter | **Global** — Enter triggers Submit/Exit from anywhere on the page |
| 4 | ESC during form-mode tables | **Deselect multi-select entries only** — never uncheck checkboxes / radio buttons |
| 5 | Order of selections in payload | **Irrelevant** (chronological wins by simplicity — push to array as clicks happen) |
| 6 | Locale detection fallback | **`<html lang>` only, then US default**. Skip `navigator.language` entirely (not reliably available on Safari mobile per user). If `<html lang>` is missing or not in the recognized European/space-separator lists, fall back to US format (`,` thousand, `.` decimal). |

## 7. Out of scope (intentionally deferred)

- Range-select for chart points / scatter data (drag to select a range)
- Shift-click for "select range from previous" on graph nodes
- Saving selection state to URLSearchParams for shareable links
- Multi-page selection (selection survives page navigation)
- Selection groups / labels ("name this set of selections")

## 8. Decision log

- **2026-05-04** — Submit button: top-right + bottom-left mirrored pair (user)
- **2026-05-04** — Hover and selected use the same accent colour; hover adds a glow, selected has none (user)
- **2026-05-04** — Enter triggers Submit globally, no focus required (user)
- **2026-05-04** — ESC clears multi-select entries only; preserves form-mode checkbox/radio state (user)
- **2026-05-04** — Selection order in payload is irrelevant; default to chronological for simplicity (user)
- **2026-05-04** — Locale detection: `<html lang>` only, no `navigator.language` (unreliable on Safari mobile), default US (user)

---

**All open questions resolved. Phase 1 implementation begins.**
