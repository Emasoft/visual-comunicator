// test-comment-modal.js
//
// Dev-browser script — exercises the v2 modal-comment flow on a
// synthetic agent report. Each test prints exactly one line:
//
//   TEST | <name> | PASS|FAIL|ERROR | <description> | <detail>
//
// The test server (tests/server.py) exposes:
//   - /sample-report.html (and ve-runtime.js sibling)
//   - POST /__ve-comment       — same as ve-select.py's queue endpoint
//   - GET  /__ve-reply/<tid>   — same polling endpoint
//   - POST /__ve-test-reply    — TEST-ONLY: write a reply file from JSON
//                                payload {threadId, turn, text}
//
// Pre-conditions:
//   - server up on http://127.0.0.1:8767/
//   - queue dir is /tmp/ve-comments-tests/ (cleaned by orchestrator
//     before this script runs)

const FIXTURE = "http://127.0.0.1:8767/sample-report.html";

const results = [];

function record(name, status, desc, detail) {
  results.push({ name, status, desc, detail: detail || '' });
}

async function setup(page) {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.goto(FIXTURE + "?cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
}

async function hoverThenClickPill(page, anchorSelector) {
  const t = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { px: r.x + 60, py: r.y + 8, cid: el.getAttribute('data-ve-comment-id') };
  }, anchorSelector);
  if (!t) return null;
  await page.mouse.move(t.px, t.py);
  await page.waitForTimeout(400);
  const pill = await page.evaluate(() => {
    const el = document.querySelector('.ve-comment-pill');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, opacity: el.style.opacity };
  });
  if (!pill || pill.opacity === '0') return null;
  await page.mouse.move(pill.cx, pill.cy, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  return t;
}

async function typeIntoModal(page, text) {
  const ta = await page.evaluate(() => {
    const t = document.querySelector('.ve-comment-modal textarea');
    const r = t.getBoundingClientRect();
    return { x: r.x + 30, y: r.y + 20 };
  });
  await page.mouse.click(ta.x, ta.y);
  await page.waitForTimeout(100);
  await page.keyboard.type(text);
  await page.waitForTimeout(150);
}

async function clickModalButton(page, label) {
  const pos = await page.evaluate((lbl) => {
    const buttons = Array.from(document.querySelectorAll('.ve-comment-modal button'));
    const b = buttons.find(x => new RegExp('^' + lbl + '$', 'i').test(x.textContent.trim()));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: b.disabled };
  }, label);
  if (!pos) return false;
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(400);
  return true;
}

async function writeAgentReply(page, threadId, turn, text) {
  // Calls the test-only endpoint that writes a reply file into the queue
  // (server-side). This is the only way for the QuickJS sandbox to
  // inject queue artefacts because the sandbox has no FS access.
  return page.evaluate(async ({ tid, t, text }) => {
    const r = await fetch('/__ve-test-reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: tid, turn: t, text: text }),
    });
    return r.ok;
  }, { tid: threadId, t: turn, text });
}

// ── Tests ───────────────────────────────────────────────────────────

async function testHoverPillAppears(page) {
  // Hovering a paragraph shows the comment pill (opacity:1 within ~400ms).
  await setup(page);
  const t = await page.evaluate(() => {
    const p = document.querySelector('p[data-ve-comment-id]');
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { px: r.x + 60, py: r.y + 8 };
  });
  await page.mouse.move(t.px, t.py);
  await page.waitForTimeout(450);
  const pill = await page.evaluate(() => {
    const el = document.querySelector('.ve-comment-pill');
    return el ? { opacity: el.style.opacity, text: el.textContent } : null;
  });
  const ok = pill && pill.opacity === '1' && /Comment this/.test(pill.text);
  record('modal_hover_pill_appears', ok ? 'PASS' : 'FAIL', 'hover paragraph → pill visible', JSON.stringify(pill));
}

async function testHoverBridgeAndClick(page) {
  // BUG #1 fix: real-mouse-path move from anchor to pill keeps the pill
  // visible long enough for the click to land and open the modal.
  await setup(page);
  const t = await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  if (!t) {
    record('modal_hover_bridge_click', 'FAIL', 'real-mouse-path hover→pill→click', 'hover or pill missing');
    return;
  }
  const modal = await page.evaluate(() => ({
    display: document.querySelector('.ve-comment-modal')?.style.display,
    bodyAttr: document.body.getAttribute('data-ve-comment-modal-open'),
    activeAnchor: document.querySelector('[data-ve-comment-active]')?.getAttribute('data-ve-comment-id'),
  }));
  const ok = modal.display === 'flex' && modal.bodyAttr === '1' && modal.activeAnchor === t.cid;
  record('modal_hover_bridge_click', ok ? 'PASS' : 'FAIL', 'real-mouse-path hover→pill→click opens modal', JSON.stringify(modal));
}

async function testPostCommentRoundTrip(page) {
  // ANSWER on a fresh thread POSTs to /__ve-comment and starts polling.
  await setup(page);
  const t = await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await typeIntoModal(page, 'Round-trip test comment.');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(500);
  const stored = await page.evaluate(cid => JSON.parse(localStorage.getItem('ve-comment-thread:' + cid) || 'null'), t.cid);
  const ok = stored && stored.turns.length === 2
    && stored.turns[0].role === 'user' && stored.turns[0].text === 'Round-trip test comment.'
    && stored.turns[1].role === 'agent' && stored.turns[1].pending === true;
  record('modal_post_comment_round_trip', ok ? 'PASS' : 'FAIL',
    'ANSWER persists user turn + pending agent turn',
    JSON.stringify(stored && { threadId: stored.threadId, turns: stored.turns.map(t => `${t.turn}:${t.role}${t.pending ? '(pending)' : ''}`) }));
}

async function testReplyAppearsViaPolling(page) {
  // Writing a reply file → next poll cycle (≤1.5s) renders agent reply.
  await setup(page);
  const t = await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await typeIntoModal(page, 'Polling test.');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(cid => JSON.parse(localStorage.getItem('ve-comment-thread:' + cid)), t.cid);
  await writeAgentReply(page, stored.threadId, 2, 'Server-replied via polling.');
  await page.waitForTimeout(2200); // > one poll cycle (1.5s)
  const active = await page.evaluate(() => document.querySelector('.ve-comment-modal .ve-comment-active-content')?.textContent || '');
  const ok = /Server-replied via polling/.test(active);
  record('modal_reply_via_polling', ok ? 'PASS' : 'FAIL', 'reply file → modal renders within 2.2s', JSON.stringify(active.slice(0, 80)));
}

async function testPollingResumeOnReopen(page) {
  // BUG #2 fix: close the modal while pending → write reply file → reopen
  // and verify the modal picks up the reply (poll loop resumes).
  await setup(page);
  const t = await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await typeIntoModal(page, 'Resume test.');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(cid => JSON.parse(localStorage.getItem('ve-comment-thread:' + cid)), t.cid);
  await clickModalButton(page, 'DONE');
  await page.waitForTimeout(300);
  await writeAgentReply(page, stored.threadId, 2, 'Resume verification reply.');
  // Reopen
  await hoverThenClickPill(page, `p[data-ve-comment-id="${t.cid}"]`);
  await page.waitForTimeout(2200); // wait for first poll
  const active = await page.evaluate(() => document.querySelector('.ve-comment-modal .ve-comment-active-content')?.textContent || '');
  const ok = /Resume verification reply/.test(active);
  record('modal_polling_resume_on_reopen', ok ? 'PASS' : 'FAIL', 'reply written while closed → reopen renders it', JSON.stringify(active.slice(0, 80)));
}

async function testAtomicPendingSave(page) {
  // BUG #3 fix: pending agent turn persists to localStorage atomically
  // with the committed user turn (single save in handleAnswerButton).
  await setup(page);
  const t = await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await typeIntoModal(page, 'Atomic save test.');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(150); // BEFORE any subsequent saves
  const stored = await page.evaluate(cid => JSON.parse(localStorage.getItem('ve-comment-thread:' + cid)), t.cid);
  const ok = stored && stored.turns.length === 2 && stored.turns[1].pending === true;
  record('modal_atomic_pending_save', ok ? 'PASS' : 'FAIL',
    'pending placeholder persisted immediately after ANSWER',
    JSON.stringify(stored && stored.turns.map(t => `${t.turn}:${t.role}${t.pending ? '(p)' : ''}`)));
}

async function testMultiTurnDialogue(page) {
  // 4-turn flow: user-1, agent-2 (auto), user-3, agent-4 (auto).
  await setup(page);
  const t = await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await typeIntoModal(page, 'Q1?');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(300);
  const s1 = await page.evaluate(cid => JSON.parse(localStorage.getItem('ve-comment-thread:' + cid)), t.cid);
  await writeAgentReply(page, s1.threadId, 2, 'A1.');
  await page.waitForTimeout(2200);
  // Now ANSWER again to start turn 3
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(200);
  await typeIntoModal(page, 'Q2?');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(300);
  await writeAgentReply(page, s1.threadId, 4, 'A2.');
  await page.waitForTimeout(2200);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.ve-comment-thread-row')).map(li => li.textContent.trim()));
  const final = await page.evaluate(() => document.querySelector('.ve-comment-active-content')?.textContent || '');
  const ok = rows.length === 4
    && rows[0].includes('1: user') && rows[1].includes('2: agent')
    && rows[2].includes('3: user') && rows[3].includes('4: agent')
    && /A2\./.test(final);
  record('modal_multi_turn_dialogue', ok ? 'PASS' : 'FAIL', '4-turn user/agent/user/agent', JSON.stringify({ rows, final: final.slice(0, 30) }));
}

async function testDraftPreservedAcrossClose(page) {
  // Half-typed text in the textarea is preserved across DONE+reopen.
  await setup(page);
  const t = await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await typeIntoModal(page, 'Half-typed draft.');
  await clickModalButton(page, 'DONE');
  await page.waitForTimeout(300);
  await hoverThenClickPill(page, `p[data-ve-comment-id="${t.cid}"]`);
  const restored = await page.evaluate(() => document.querySelector('.ve-comment-modal textarea')?.value || '');
  const ok = restored === 'Half-typed draft.';
  record('modal_draft_preserved', ok ? 'PASS' : 'FAIL', 'half-typed draft restored after DONE+reopen', JSON.stringify(restored));
}

async function testEscClosesModal(page) {
  // Pressing ESC closes the modal.
  await setup(page);
  await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => document.querySelector('.ve-comment-modal').style.display === 'none');
  record('modal_esc_closes', closed ? 'PASS' : 'FAIL', 'Escape closes the modal', `display=${closed ? 'none' : 'flex'}`);
}

async function testDoneButtonCloses(page) {
  // Pressing DONE closes the modal.
  await setup(page);
  await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  await clickModalButton(page, 'DONE');
  const closed = await page.evaluate(() => document.querySelector('.ve-comment-modal').style.display === 'none');
  record('modal_done_button_closes', closed ? 'PASS' : 'FAIL', 'DONE button closes the modal', '');
}

async function testListItemAnchor(page) {
  // Comments work on <li data-ve-comment-id>.
  await setup(page);
  const t = await hoverThenClickPill(page, 'li[data-ve-comment-id]');
  const cid = t && t.cid;
  await typeIntoModal(page, 'Comment on list item.');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(c => JSON.parse(localStorage.getItem('ve-comment-thread:' + c)), cid);
  const ok = stored && stored.turns[0].text === 'Comment on list item.';
  record('modal_anchor_list_item', ok ? 'PASS' : 'FAIL', 'comment on <li> commits + posts', `cid=${cid}`);
}

async function testTableRowAnchor(page) {
  // Comments work on <tr data-ve-comment-id>.
  await setup(page);
  const t = await hoverThenClickPill(page, 'tr[data-ve-comment-id]');
  const cid = t && t.cid;
  await typeIntoModal(page, 'Comment on table row.');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(c => JSON.parse(localStorage.getItem('ve-comment-thread:' + c)), cid);
  const ok = stored && stored.turns[0].text === 'Comment on table row.';
  record('modal_anchor_table_row', ok ? 'PASS' : 'FAIL', 'comment on <tr> commits + posts', `cid=${cid}`);
}

async function testCodeBlockAnchor(page) {
  // Comments work on <pre data-ve-comment-id>.
  await setup(page);
  const t = await hoverThenClickPill(page, 'pre[data-ve-comment-id]');
  const cid = t && t.cid;
  await typeIntoModal(page, 'Comment on code block.');
  await clickModalButton(page, 'ANSWER');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(c => JSON.parse(localStorage.getItem('ve-comment-thread:' + c)), cid);
  const ok = stored && stored.turns[0].text === 'Comment on code block.';
  record('modal_anchor_code_block', ok ? 'PASS' : 'FAIL', 'comment on <pre> commits + posts', `cid=${cid}`);
}

async function testPageScrollsWhileModalOpen(page) {
  // Page can still scroll while the modal is open.
  await setup(page);
  await hoverThenClickPill(page, 'p[data-ve-comment-id]');
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.scrollY);
  const layoutOk = await page.evaluate(() => getComputedStyle(document.querySelector('main')).marginRight === '480px');
  const ok = after > before && layoutOk;
  record('modal_page_scrolls_while_open', ok ? 'PASS' : 'FAIL', 'wheel scroll under modal works + reflow margin survives', `scrollY ${before}→${after}, marginRight=${layoutOk ? '480px' : '?'}`);
}

// ── Runner ──────────────────────────────────────────────────────────

const tests = [
  testHoverPillAppears,
  testHoverBridgeAndClick,
  testPostCommentRoundTrip,
  testReplyAppearsViaPolling,
  testPollingResumeOnReopen,
  testAtomicPendingSave,
  testMultiTurnDialogue,
  testDraftPreservedAcrossClose,
  testEscClosesModal,
  testDoneButtonCloses,
  testListItemAnchor,
  testTableRowAnchor,
  testCodeBlockAnchor,
  testPageScrollsWhileModalOpen,
];

const page = await browser.getPage("modal-tests");

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
