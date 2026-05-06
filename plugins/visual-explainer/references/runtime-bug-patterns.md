# ve-runtime + ve-regex bug patterns

A catalogue of bug classes found in the visual-explainer runtime,
the v2 modal-comment flow, and the embedded ve-regex visualizer —
each entry pairs the symptom with the fix and points at the
verification test that locks the fix in place.

When extending the runtime, glance through this file before writing
hover affordances, multi-mount React widgets, keyboard handlers,
or anything that posts to the comment queue.

---

## v2 modal — hover-bridge

**Symptom:** Clicking the hover pill never opens the modal under a
real mouse. The pill is visible the moment you stop moving, but by
the time `mousedown` fires the pill has been hidden because the
underlying paragraph already fired `mouseleave`.

**Why:** The pill lives on `document.body`, NOT inside the
commentable element. Crossing the pointer from anchor to pill IS
"leaving the anchor" as far as the DOM is concerned. The capture-
phase `mouseleave` listener cleared `commentHoverTarget` and
`pointer-events:none` before the click could land.

**Fix:** Defer the hide on a 180 ms timer; cancel it on `mouseover`
of the pill or its descendants.
(`plugins/visual-explainer/scripts/ve-runtime.js`,
`scheduleHideCommentHoverPill` + `cancelCommentPillHide`.)

**Test:** `tests/scripts/test-comment-modal.js` →
`testHoverBridgeAndClick`. Drives a real-mouse-path from anchor
to pill via `page.mouse.move(.., { steps: 8 })` and asserts the
modal opens.

---

## v2 modal — resume polling on reopen

**Symptom:** User clicks ANSWER, closes the modal before the agent
reply arrives, the orchestrator writes the reply file to disk later.
On reopen the modal shows "Waiting for Claude to reply…" forever.

**Why:** `closeCommentModal` clears `pollHandle`. `openCommentModal`
rebuilds state from `localStorage` (which has the pending agent
placeholder) but never restarts the poll loop.

**Fix:** After rendering, scan `commentModalState.turns` for the
first `role: 'agent', pending: true` turn and call
`pollForCommentReply(turn)` for it.

**Test:** `testPollingResumeOnReopen`. Posts a comment, presses
DONE, writes a reply file via the test server's `__ve-test-reply`
endpoint, reopens the thread, asserts the modal renders the reply
within 2.2 s (one poll cycle + margin).

---

## v2 modal — atomic save of pending placeholder

**Symptom:** Page refresh between ANSWER and reply arrival drops
the pending placeholder from `localStorage`, defeating the
resume-polling fix.

**Why:** `handleAnswerButton` called `saveThreadToStorage` before
pushing the pending agent turn. The save persisted only the user
turn; the pending was added immediately afterwards but not
persisted until the modal closed.

**Fix:** Push the pending FIRST, save once. One save covers both
turns atomically.

**Test:** `testAtomicPendingSave`. Reads localStorage 150 ms after
ANSWER (before any subsequent saves can have fired) and asserts
both turn 1 (committed user) and turn 2 (pending agent) are present.

---

## ve-regex — per-mount undo / redo history

**Symptom:** Pressing ⌘Z on regex graph A pops history pushed by
graph B. Both graphs end up displaying the wrong AST.

**Why:** `undoStack` and `redoStack` were exported from
`vendor/regex-vis/src/atom/atoms.ts` as module-level mutable arrays.
The runtime mounts a fresh Jotai store per `.ve-regex` block via
`createStore()`, but the arrays are shared at the module level —
each mount's `undoAtom` writer pushes/pops the same stack.

**Fix:** Replace the arrays with Jotai atoms (`undoStackAtom`,
`redoStackAtom`). Each `<Provider store={createStore()}>` scopes
its own copy. `pushUndoAtom`, `undoAtom`, `redoAtom` all use
`get`/`set` on those atoms.

**Test:** `tests/scripts/test-regex-panels.js` →
`testUndoRedoPerMount`. Edits R1, presses ⌘Z, asserts R1 reverts
without disturbing other mounts.

---

## ve-regex — case-insensitive Z for Cmd-Shift-Z

**Symptom:** ⌘⇧Z silently no-ops. Undo works (`⌘Z` → revert), but
redo never restores the undone state.

**Why:** `KeyboardEvent.key` reflects the *produced character*, not
the physical key. Holding Shift case-shifts the value to `'Z'`. The
upstream check `key === 'z'` matched only ⌘Z, never ⌘⇧Z.

**Fix:** Compare case-insensitively: `key === 'z' || key === 'Z'`.

**Test:** `testUndoRedoPerMount` covers both ⌘Z and ⌘⇧Z and asserts
the redoOk branch.

---

## ve-regex — shift+click extends selection

**Symptom:** The empty-state placeholder advertised "Hold shift
while clicking to extend the selection," but shift-click replaced
the selection just like a plain click.

**Why:** `vendor/regex-vis/src/graph/content.tsx` `handleClick`
ignored `event.shiftKey` and always called `selectNode(id)`.

**Fix:** New atom `toggleSelectNodeAtom` in `atom/select.ts` that
toggles a single id in/out of `selectedIdsAtom`. `Content`'s click
handler routes shift-clicks to it.

**Test:** `testShiftClickMultiSelect`. Clicks `\d`, shift+clicks
`\w` in the `\d\w\s` graph, asserts both nodes carry the selection
class.

---

## ve-regex — wide regex per-graph horizontal scroll

**Symptom:** Stress regexes (R20–R22) with SVG widths 1150–1580 px
push the page width past the viewport, producing a window-level
horizontal scrollbar. The right-most graph nodes are unreachable
without page-scrolling.

**Why:** `.ve-regex-app` was `display: flex; overflow: visible`;
the inner graph wrapper was `display: inline-block` and
unconstrained. Wide SVGs grew their parent column unbounded.

**Fix:** In `vendor/regex-vis/src/global.css`:

```css
.ve-regex-app { overflow: hidden; max-width: 100%; }
.ve-regex-app > .relative.inline-block {
  flex: 1 1 0;
  min-width: 0;
  display: block;
  overflow-x: auto;
  overflow-y: visible;
}
```

The graph wrapper now takes the remaining flex space, can shrink
below the SVG's intrinsic width, and grows its own horizontal
scrollbar when needed.

**Test:** `testWideRegexOverflow`. Asserts every stress regex has
`overflow-x: auto` and `scrollWidth > clientWidth`, AND that
`document.body.scrollWidth === clientWidth` (no page-level
horizontal overflow).

---

## Common shape

Every bug above shares one structure:

1. The runtime did the obvious thing — single-line listener,
   module-level array, strict equality check.
2. A second instance, a modifier, or a different mouse path made
   the obvious thing wrong.
3. The fix is small (1–10 lines) but unobvious without the
   reproduction.

When in doubt, write the test FIRST. Most of these were found
because a Playwright test exposed timing the manual-click test
hid. See `~/.claude/rules/browser-ui-test-techniques.md` for the
generalised techniques.

## Running the test suite

```bash
plugins/visual-explainer/tests/run-all-tests.sh
```

Output: Unicode-bordered results table, exits 0 only if all pass.
See `plugins/visual-explainer/tests/README.md` for prerequisites.
