// test-regex-panels.js
//
// Dev-browser script (QuickJS sandbox) — exercises every edit-panel
// surface of the embedded ve-regex visualizer. Each test function
// is named, has a one-line docstring, and prints exactly one line:
//
//   TEST | <name> | PASS|FAIL|ERROR | <description> | <detail>
//
// The Python orchestrator (run-tests.py) parses these lines into a
// Unicode-bordered table.
//
// Pre-conditions:
//   - HTTP server up on http://127.0.0.1:8767/ serving
//     plugins/visual-explainer/tests/fixtures/
//   - ve-runtime.js, ve-regex.umd.js, ve-regex.css siblinged with
//     the fixture HTML (run-all-tests.sh handles the sync).

const FIXTURE = "http://127.0.0.1:8767/regex-vis-all-panels.html";

const results = [];

function record(name, status, desc, detail) {
  results.push({ name, status, desc, detail: detail || '' });
}

async function setup(page) {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.goto(FIXTURE + "?cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ve-regex svg", { timeout: 8000 });
}

async function clickRectAtIndex(page, regexIdx, rectStrategy) {
  return page.evaluate(([i, strat]) => {
    const wrap = document.querySelectorAll('.ve-regex')[i];
    wrap.scrollIntoView({ block: 'center' });
    const rects = Array.from(wrap.querySelectorAll('svg rect'));
    let target;
    if (strat.kind === 'outer') {
      target = rects.reduce((a, b) => {
        const ba = a.getBoundingClientRect();
        const bb = b.getBoundingClientRect();
        return ba.width * ba.height > bb.width * bb.height ? a : b;
      });
    } else {
      target = rects[strat.rectIndex || 0];
    }
    const bb = target.getBoundingClientRect();
    return strat.kind === 'outer'
      ? { x: bb.x + bb.width / 2, y: bb.y + 8 }
      : { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
  }, [regexIdx, rectStrategy]);
}

async function panelHeadings(page, regexIdx) {
  return page.evaluate(i => {
    const wrap = document.querySelectorAll('.ve-regex')[i];
    const tab = wrap.querySelector('[data-testid="edit-tab"]');
    if (!tab) return null;
    return Array.from(tab.querySelectorAll('h5,h6')).map(h => h.textContent.trim());
  }, regexIdx);
}

// ── Panel-presence tests ────────────────────────────────────────────

async function testR1SimpleStringPanel(page) {
  // R1: clicking the literal "abc" reveals the simple-string content panel.
  await setup(page);
  const pos = await clickRectAtIndex(page, 0, { kind: 'inner' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const h = await panelHeadings(page, 0);
  if (!h) return record('regex_R1_simple_string', 'FAIL', 'simple-string panel after click', 'no edit-tab in DOM');
  const expected = ['Insert around', 'Group selection', 'Expression', 'Content', 'Type', 'Value', 'Quantifier', 'times'];
  const ok = expected.every(e => h.includes(e));
  record('regex_R1_simple_string', ok ? 'PASS' : 'FAIL', 'simple-string panel after click', JSON.stringify(h));
}

async function testR2ClassCharacterPanel(page) {
  // R2: clicking \d opens the class-character panel with a 22-option Class dropdown.
  await setup(page);
  const pos = await clickRectAtIndex(page, 1, { kind: 'inner', rectIndex: 0 });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[1];
    const tab = wrap.querySelector('[data-testid="edit-tab"]');
    const triggers = Array.from(tab.querySelectorAll('[role="combobox"]')).map(b => b.textContent);
    return triggers;
  });
  const ok = info.length >= 2 && /Character class/.test(info[0]) && /Any digit/.test(info[1]);
  record('regex_R2_class_character', ok ? 'PASS' : 'FAIL', 'class-character panel + Class trigger', JSON.stringify(info));
}

async function testR3RangesPanel(page) {
  // R3: clicking [a-z0-9] opens the ranges editor with two range rows.
  await setup(page);
  const pos = await clickRectAtIndex(page, 2, { kind: 'inner' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const inputs = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[2];
    const tab = wrap.querySelector('[data-testid="edit-tab"]');
    return Array.from(tab.querySelectorAll('input')).map(i => i.value);
  });
  const ok = inputs.length === 4 && inputs[0] === 'a' && inputs[1] === 'z' && inputs[2] === '0' && inputs[3] === '9';
  record('regex_R3_ranges', ok ? 'PASS' : 'FAIL', 'ranges editor with 2 rows (a-z, 0-9)', JSON.stringify(inputs));
}

async function testR4NegateToggle(page) {
  // R4: [^a-z] starts with negate=true; toggling switches "None of" → "One of".
  await setup(page);
  const pos = await clickRectAtIndex(page, 3, { kind: 'inner' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[3];
    const cb = wrap.querySelector('[data-testid="edit-tab"] button[role="checkbox"]');
    cb.scrollIntoView({ block: 'center' });
    return new Promise(r => setTimeout(() => {
      const bb = cb.getBoundingClientRect();
      const labels = Array.from(wrap.querySelectorAll('svg foreignObject div')).map(d => d.textContent);
      r({ cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2, state: cb.getAttribute('aria-checked'), labels });
    }, 150));
  });
  const wasNegated = before.state === 'true' && before.labels.includes('None of');
  await page.mouse.click(before.cx, before.cy);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[3];
    return Array.from(wrap.querySelectorAll('svg foreignObject div')).map(d => d.textContent);
  });
  const flipped = !after.includes('None of') && after.includes('One of');
  record('regex_R4_negate_toggle', wasNegated && flipped ? 'PASS' : 'FAIL',
    'ranges Negate flips label "None of"↔"One of"',
    JSON.stringify({ wasNegated, after }));
}

async function testR5BackRefPanel(page) {
  // R5: clicking \1 opens the back-reference panel.
  await setup(page);
  const pos = await clickRectAtIndex(page, 4, { kind: 'inner', rectIndex: 2 });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const triggers = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[4];
    const tab = wrap.querySelector('[data-testid="edit-tab"]');
    return Array.from(tab.querySelectorAll('[role="combobox"]')).map(b => b.textContent);
  });
  const ok = triggers.some(t => /Back reference/.test(t)) && triggers.some(t => /Group #1/.test(t));
  record('regex_R5_back_reference', ok ? 'PASS' : 'FAIL', 'back-ref panel + Group #1 dropdown', JSON.stringify(triggers));
}

async function testR6WordBoundaryPanel(page) {
  // R6: clicking \b opens the word-boundary panel with Negate.
  await setup(page);
  const pos = await clickRectAtIndex(page, 5, { kind: 'inner' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const ok = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[5];
    const tab = wrap.querySelector('[data-testid="edit-tab"]');
    const triggers = Array.from(tab.querySelectorAll('[role="combobox"]')).map(b => b.textContent);
    const cb = tab.querySelector('button[role="checkbox"]');
    return triggers.some(t => /Word Boundary/.test(t)) && cb !== null;
  });
  record('regex_R6_word_boundary', ok ? 'PASS' : 'FAIL', 'word-boundary panel + Negate checkbox', '');
}

async function testR9CapturingGroup(page) {
  // R9: clicking outer (abc) opens the group panel with kind=Capturing.
  await setup(page);
  const pos = await clickRectAtIndex(page, 8, { kind: 'outer' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const triggers = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[8];
    const tab = wrap.querySelector('[data-testid="edit-tab"]');
    return Array.from(tab.querySelectorAll('[role="combobox"]')).map(b => b.textContent);
  });
  const ok = triggers.some(t => /Capturing group/.test(t));
  record('regex_R9_capturing_group', ok ? 'PASS' : 'FAIL', 'group panel kind=Capturing', JSON.stringify(triggers));
}

async function testR10NamedGroupRename(page) {
  // R10: rename year→yyyy commits live; graph header relabels.
  await setup(page);
  const pos = await clickRectAtIndex(page, 9, { kind: 'outer' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const inpPos = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[9];
    const inp = wrap.querySelector('[data-testid="edit-tab"] input');
    inp.scrollIntoView({ block: 'center' });
    return new Promise(r => setTimeout(() => {
      const bb = inp.getBoundingClientRect();
      r({ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
    }, 150));
  });
  await page.mouse.click(inpPos.x, inpPos.y);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('yyyy');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const labels = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[9];
    return Array.from(wrap.querySelectorAll('svg foreignObject div')).map(d => d.textContent);
  });
  const ok = labels.some(l => l === 'Group #yyyy');
  record('regex_R10_named_group_rename', ok ? 'PASS' : 'FAIL', 'live rename year→yyyy', JSON.stringify(labels));
}

async function testR12LookaheadNegate(page) {
  // R12: toggling Negate on a(?=b) flips graph to "Not followed by:".
  await setup(page);
  const pos = await clickRectAtIndex(page, 11, { kind: 'outer' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const cbPos = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[11];
    const cb = wrap.querySelector('[data-testid="edit-tab"] button[role="checkbox"]');
    cb.scrollIntoView({ block: 'center' });
    return new Promise(r => setTimeout(() => {
      const bb = cb.getBoundingClientRect();
      r({ cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 });
    }, 150));
  });
  await page.mouse.click(cbPos.cx, cbPos.cy);
  await page.waitForTimeout(400);
  const labels = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[11];
    return Array.from(wrap.querySelectorAll('svg foreignObject div')).map(d => d.textContent);
  });
  const ok = labels.some(l => /Not followed by/.test(l));
  record('regex_R12_lookahead_negate', ok ? 'PASS' : 'FAIL', 'lookahead Negate flips to "Not followed by:"', JSON.stringify(labels));
}

async function testR16QuantifierKind(page) {
  // R16: switching the times dropdown from "+1 or more" to "{min,max} custom" updates the badge.
  await setup(page);
  const pos = await clickRectAtIndex(page, 15, { kind: 'inner' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const trigPos = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[15];
    const tab = wrap.querySelector('[data-testid="edit-tab"]');
    const triggers = Array.from(tab.querySelectorAll('[role="combobox"]'));
    const times = triggers.find(t => /\+|more|custom|default/i.test(t.textContent));
    times.scrollIntoView({ block: 'center' });
    return new Promise(r => setTimeout(() => {
      const bb = times.getBoundingClientRect();
      r({ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
    }, 150));
  });
  await page.mouse.click(trigPos.x, trigPos.y);
  await page.waitForTimeout(400);
  const optPos = await page.evaluate(() => {
    const lb = document.querySelector('[role="listbox"]');
    if (!lb) return null;
    const opts = Array.from(lb.querySelectorAll('[role="option"]'));
    const custom = opts.find(o => /custom/i.test(o.textContent));
    if (!custom) return null;
    const r = custom.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!optPos) {
    record('regex_R16_quantifier_kind', 'FAIL', 'switch quantifier to {min,max} custom', 'custom option not in listbox');
    return;
  }
  await page.mouse.click(optPos.x, optPos.y);
  await page.waitForTimeout(400);
  const labels = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[15];
    return Array.from(wrap.querySelectorAll('svg foreignObject div')).map(d => d.textContent);
  });
  const ok = labels.some(l => /1 - /.test(l) || /1\s*-\s*∞/.test(l));
  record('regex_R16_quantifier_kind', ok ? 'PASS' : 'FAIL', 'switch quantifier to {min,max} custom', JSON.stringify(labels));
}

// ── Cross-cutting tests ─────────────────────────────────────────────

async function testLiveValueEdit(page) {
  // R1: editing the Value field re-renders the graph live (abc→hello).
  await setup(page);
  const pos = await clickRectAtIndex(page, 0, { kind: 'inner' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const inpPos = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[0];
    const inp = wrap.querySelector('[data-testid="edit-tab"] input');
    const r = inp.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(inpPos.x, inpPos.y);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('hello');
  await page.waitForTimeout(500);
  const labels = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[0];
    return Array.from(wrap.querySelectorAll('svg foreignObject')).map(f => f.textContent);
  });
  const ok = labels.some(l => /hello/.test(l));
  record('regex_live_value_edit', ok ? 'PASS' : 'FAIL', 'live value edit re-renders graph', JSON.stringify(labels));
}

async function testUndoRedoPerMount(page) {
  // BUG #1: undo/redo are now per-mount (Jotai atom-scoped). ⌘z reverts only this mount's last edit.
  await setup(page);
  // Edit R1 abc→hello
  const pos = await clickRectAtIndex(page, 0, { kind: 'inner' });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const inpPos = await page.evaluate(() => {
    const inp = document.querySelectorAll('.ve-regex')[0].querySelector('[data-testid="edit-tab"] input');
    const r = inp.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(inpPos.x, inpPos.y);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('hello');
  await page.waitForTimeout(500);
  await page.mouse.click(50, 50);  // defocus input
  await page.waitForTimeout(150);
  // Undo
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(500);
  const undone = await page.evaluate(() => Array.from(document.querySelectorAll('.ve-regex')[0].querySelectorAll('svg foreignObject')).map(f => f.textContent));
  // Redo (with Shift, key value case-shifts to 'Z' — test-fix #1.5)
  await page.keyboard.press('Meta+Shift+Z');
  await page.waitForTimeout(500);
  const redone = await page.evaluate(() => Array.from(document.querySelectorAll('.ve-regex')[0].querySelectorAll('svg foreignObject')).map(f => f.textContent));
  const undoOk = undone.some(l => /abc/.test(l)) && !undone.some(l => /hello/.test(l));
  const redoOk = redone.some(l => /hello/.test(l));
  record('regex_undo_redo_per_mount', undoOk && redoOk ? 'PASS' : 'FAIL',
    '⌘z undo + ⌘⇧Z redo (Shift-shifted key)',
    JSON.stringify({ undone, redone, undoOk, redoOk }));
}

async function testShiftClickMultiSelect(page) {
  // BUG #2: shift-click extends the selection. R2 \d\w\s — click \d, shift+click \w → both selected.
  await setup(page);
  const r2 = await page.evaluate(() => {
    const wrap = document.querySelectorAll('.ve-regex')[1];
    wrap.scrollIntoView({ block: 'center' });
    return new Promise(r => setTimeout(() => {
      const rects = Array.from(wrap.querySelectorAll('svg rect'));
      r(rects.map(rt => {
        const bb = rt.getBoundingClientRect();
        return { cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 };
      }));
    }, 150));
  });
  await page.mouse.click(r2[0].cx, r2[0].cy);
  await page.waitForTimeout(200);
  await page.keyboard.down('Shift');
  await page.mouse.click(r2[1].cx, r2[1].cy);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  const highlights = await page.evaluate(() => document.querySelectorAll('.ve-regex')[1].querySelectorAll('rect.ve-regex-selected-fill').length);
  const ok = highlights === 2;
  record('regex_shift_click_multi_select', ok ? 'PASS' : 'FAIL', 'shift+click selects 2 nodes', `highlights=${highlights}`);
}

async function testWideRegexOverflow(page) {
  // BUG #3: wide stress regexes (R20-R22, 1150-1580 px) get per-graph horizontal scroll, page no longer overflows.
  await setup(page);
  const data = await page.evaluate(() => {
    const summary = ['20', '21', '22'].map(idx => {
      const wrap = document.querySelectorAll('.ve-regex')[parseInt(idx, 10) - 1];
      const inner = wrap.querySelector('svg').parentElement;
      return {
        regex: 'R' + idx,
        innerOverflowX: getComputedStyle(inner).overflowX,
        hasHScroll: inner.scrollWidth > inner.clientWidth,
      };
    });
    return {
      summary,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
  const allHaveScroll = data.summary.every(s => s.innerOverflowX === 'auto' && s.hasHScroll);
  const pageNoOverflow = data.bodyScrollWidth === data.bodyClientWidth;
  record('regex_wide_overflow_per_graph_scroll', allHaveScroll && pageNoOverflow ? 'PASS' : 'FAIL',
    'wide stress regexes have per-graph scroll, page does not overflow',
    JSON.stringify(data));
}

// ── Runner ──────────────────────────────────────────────────────────

const tests = [
  testR1SimpleStringPanel,
  testR2ClassCharacterPanel,
  testR3RangesPanel,
  testR4NegateToggle,
  testR5BackRefPanel,
  testR6WordBoundaryPanel,
  testR9CapturingGroup,
  testR10NamedGroupRename,
  testR12LookaheadNegate,
  testR16QuantifierKind,
  testLiveValueEdit,
  testUndoRedoPerMount,
  testShiftClickMultiSelect,
  testWideRegexOverflow,
];

const page = await browser.getPage("regex-tests");

for (const t of tests) {
  try {
    await t(page);
  } catch (e) {
    record(t.name || 'unnamed', 'ERROR', t.name || '', String(e && e.message || e).slice(0, 120));
  }
}

for (const r of results) {
  console.log(`TEST | ${r.name} | ${r.status} | ${r.desc} | ${r.detail.replace(/\|/g, '/')}`);
}
