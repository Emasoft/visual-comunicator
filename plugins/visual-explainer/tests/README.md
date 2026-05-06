# Visual-Explainer test suite

Two end-to-end test suites driven by [dev-browser] (Playwright Chromium):

* `scripts/test-regex-panels.js` — exercises every edit-panel surface
  of the embedded `ve-regex` visualizer (14 named tests covering
  R1–R22 panel types, undo/redo per-mount, shift+click multi-select,
  and the wide-regex per-graph overflow).
* `scripts/test-comment-modal.js` — exercises the v2 modal-comment
  flow (14 named tests covering the hover-bridge, posting, polling,
  reopen-resume, atomic save, multi-turn, draft preservation, ESC /
  DONE close, and every commentable element type — `p`, `li`, `tr`,
  `pre`).

## Usage

```bash
# from anywhere in the repo
plugins/visual-explainer/tests/run-all-tests.sh

# only one suite
plugins/visual-explainer/tests/run-tests.py --only test-regex-panels
```

Exits 0 only if every test PASSes. The runner prints a Unicode-bordered
results table and a per-failure detail block.

## What the runner does

1. Copies the production `ve-runtime.js`, `ve-regex.umd.js`,
   `ve-regex.css` into `fixtures/` so the test HTML loads the
   real bundle.
2. Re-renders `fixtures/sample-report.md` → `sample-report.html` +
   `sample-report.idmap.json` via `render-interactive-report.py`.
3. Cleans the queue dir `/tmp/ve-comments-tests/`.
4. Boots `server.py` on port 8767. The server speaks the same
   `/__ve-comment` (POST) and `/__ve-reply/<tid>` (GET) endpoints
   the production `ve-select.py` uses, plus a TEST-ONLY
   `/__ve-test-reply` (POST) that lets the QuickJS sandbox inject
   reply files into the queue (the sandbox has no FS access).
5. Runs each `scripts/test-*.js` via `dev-browser run`.
6. Parses lines of the form `TEST | <name> | PASS|FAIL|ERROR | <description> | <detail>`
   and renders them as a table.
7. Tears the server down.

## Pre-requisites

* `python3` on `PATH` (server + orchestrator).
* `uv` on `PATH` (re-renders the sample report).
* `dev-browser` on `PATH` and Chromium installed:
  ```bash
  npm install -g dev-browser
  dev-browser install
  ```

## Fixtures

* `fixtures/regex-vis-all-panels.html` — 22 regex graphs covering
  every panel surface (simple-string, class-character, ranges,
  back-ref, boundaries, group kinds, lookaround, quantifier,
  alternation, three stress regexes).
* `fixtures/sample-report.md` + `.html` + `.idmap.json` — synthetic
  4-finding agent report covering paragraph, list item, table row,
  and code block commentable anchors.
* `fixtures/ve-runtime.js` + `ve-regex.umd.js` + `ve-regex.css` —
  copied from `plugins/visual-explainer/scripts/` by the runner.

## Test naming convention

Each `test*` function in the JS files has:
* a name (`testFooBar`),
* a single-line docstring on the first comment line that the
  orchestrator prints next to the result, and
* exactly one `record(name, status, desc, detail)` call.

Adding a new test = define the function and append its name to the
`tests` array near the bottom of the script.

[dev-browser]: https://www.npmjs.com/package/dev-browser
