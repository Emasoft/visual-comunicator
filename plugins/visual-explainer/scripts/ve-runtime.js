/*!
 * visual-explainer interactive selection runtime.
 *
 * Embed this script (inline or referenced) in every generated HTML page so
 * a single click on any element marked with `data-ve-id` returns the
 * selection to the calling agent and closes the window.
 *
 * Marking elements:
 *   <div data-ve-id="card-auth"
 *        data-ve-type="card"
 *        data-ve-label="Auth service">…</div>
 *
 *   - data-ve-id    (required) opaque identifier the agent receives back
 *   - data-ve-type  (optional) category hint: card, table-row, table-cell,
 *                   chart-point, mermaid-node, slide, file, kpi, timeline,
 *                   section, etc.
 *   - data-ve-label (optional) human-readable label shown to the user;
 *                   defaults to the element's trimmed text content
 *   - data-ve-data  (optional) JSON string with extra context the agent
 *                   should receive (e.g. row/col indices, file path, value)
 *
 * Mermaid integration:
 *   In a Mermaid diagram body, append `click <NodeId> call veSelectMermaid("<NodeId>","<Label>")`
 *   for every node you want clickable. veSelectMermaid is exposed on window.
 *
 * Chart.js integration:
 *   After `new Chart(...)`, call `veWireChart(chartInstance, {id: "revenue"})`.
 *
 * Custom payloads:
 *   Call `window.veSelect({id, type, label, data})` from any handler.
 *
 * Math / LaTeX:
 *   <span class="ve-math">E = mc^2</span>            (inline)
 *   <div  class="ve-math ve-math--block">\int_0^1 x^2\,dx = \tfrac13</div>
 *   <span class="ve-math ve-math--chem">H2O + CO2 -> H2CO3</span>
 *   <span class="ve-math" data-tex="\\sum_{i=1}^n i^2">…fallback…</span>
 *
 *   The runtime lazy-loads KaTeX (+ mhchem for --chem) from CDN the first
 *   time any `.ve-math` / `[data-ve-math]` element is found, renders each,
 *   and tags it as `data-ve-type="math-formula"` so a click selects the
 *   whole formula. Mouse text-highlighting inside a rendered formula
 *   activates the snippet popup with `type=math-snippet`; the payload
 *   includes the visible selection plus the full formula's LaTeX so the
 *   agent can act on a single variable / sub-term.
 *
 * TikZ diagrams (chemistry structures, physics, thermodynamic cycles, Venn,
 * geometry, circuits, Feynman, anything TikZ can express):
 *   <div class="ve-tikz">
 *     \begin{tikzpicture}
 *       \draw (0,0) circle (1cm);
 *     \end{tikzpicture}
 *   </div>
 *
 *   Lazy-loads TikZJax (a WASM port of TikZ) from CDN the first time any
 *   `.ve-tikz` / `[data-ve-tikz]` element is found. Includes pgfplots,
 *   chemfig (\chemfig{H_2O}), physics, circuitikz, tkz-euclide, and most
 *   common TikZ libraries. The rendered <svg> output replaces the wrapper.
 *   Each rendered diagram becomes `data-ve-type="tikz-diagram"` (whole
 *   diagram click) and mouse-highlight inside its SVG fires the snippet
 *   popup with `type=tikz-snippet` carrying the user's visible selection
 *   plus the full TikZ source.
 *
 * Directed graphs (Graphviz / DOT, lazy-loaded via viz.js WASM):
 *   <div class="ve-graph" data-ve-graph-engine="dot">
 *     digraph G {
 *       rankdir=LR;
 *       start  [id="ve-node-start",  label="Start"];
 *       proc   [id="ve-node-proc",   label="Process"];
 *       done   [id="ve-node-done",   label="Done"];
 *       start -> proc -> done;
 *       proc  -> start [id="ve-edge-loop", label="retry"];
 *     }
 *   </div>
 *
 *   Lazy-loads @viz-js/viz (~1 MB WASM) the first time a `.ve-graph`
 *   element is found, renders the DOT source to SVG via `dot` (default,
 *   best for directed graphs) or any other Graphviz engine via the
 *   `data-ve-graph-engine` attribute (`dot | neato | fdp | sfdp | circo |
 *   twopi | osage | patchwork`). After render, the runtime walks the SVG
 *   and any `<g class="node">` / `<g class="edge">` whose DOT id starts
 *   with `ve-` becomes a `data-ve-id` selectable (`graph-node` /
 *   `graph-edge`). The whole graph is selectable by clicking outside any
 *   tagged node/edge. When even `dot` doesn't produce a clean layout,
 *   fall back to the manual-grid pattern: a `.ve-tikz` wrapper with
 *   `\node at (col, row) {...};` + `\draw[rounded corners]` for
 *   Manhattan-routed edges, plus `data-ve-tikz-regions` for semantic
 *   node selection.
 *
 * Semantic geometric regions over TikZ diagrams:
 *   <div class="ve-tikz"
 *        data-ve-tikz-viewbox="-1 -6 10 9"
 *        data-ve-tikz-regions='[
 *          {"id":"square-hyp", "label":"Square upon the hypotenuse",
 *           "shape":"polygon",
 *           "points":[[5,3],[2,7.2],[-1.83,4.2],[1.17,0]]},
 *          {"id":"incircle", "label":"Incircle of triangle ABC",
 *           "shape":"circle","cx":2.5,"cy":1,"r":0.8}
 *        ]'>
 *     \begin{tikzpicture}…\end{tikzpicture}
 *   </div>
 *
 *   The runtime waits for TikZJax to render, then overlays an invisible
 *   <svg> with one shape per region. Hover highlights the region; click
 *   returns the SEMANTIC identity (regionId + label) to the agent — never
 *   "path[d=…]" without meaning. Payload type is `geometric-region` and
 *   includes the full TikZ source for context. Regions take precedence
 *   over the whole-diagram click because the runtime resolves the
 *   innermost [data-ve-id] ancestor at the click target.
 *
 *   Add `data-ve-tikz-debug="1"` to draw the regions visibly so the
 *   author can verify they line up with the rendered geometry.
 *
 * Prose mode (paragraph numbering + text-snippet selection):
 *   <article data-ve-prose>
 *     <h1>Title</h1>
 *     <p>Lead paragraph…</p>
 *     <h2>Section</h2>
 *     <p>Content…</p>
 *   </article>
 *
 *   Inside [data-ve-prose] the runtime walks the DOM, assigns hierarchical
 *   numbers (1, 1.1, 1.1.1, 1.1.2 …) to each heading and paragraph, and
 *   inserts a small monospace marker at the start of each. Every numbered
 *   element becomes a selectable [data-ve-id] (type=section / paragraph)
 *   so a click selects the whole element.
 *
 *   When the user highlights a text snippet (mouse selection) inside the
 *   prose container, a floating "Ask about this snippet" button appears
 *   above the selection. Clicking it submits:
 *     { id: "ve-snippet-<pnum>-<n>", type: "text-snippet",
 *       label: "<truncated snippet>",
 *       data: { text, paragraphId, paragraphNumber, paragraphText } }
 *
 * Table-as-question (form selection):
 *   <table data-ve-id="opts" data-ve-type="table-form" data-ve-mode="single|multi"
 *          data-ve-label="Pick one">
 *     <tbody>
 *       <tr data-ve-row-id="opt-1" data-ve-row-label="React">…</tr>
 *       <tr data-ve-row-id="opt-2" data-ve-row-label="Svelte">…</tr>
 *       <tr data-ve-row-id="__text" data-ve-row-text="1"
 *           data-ve-row-label="Other"><td colspan="2">
 *         <input type="text" placeholder="Write something else here:">
 *       </td></tr>
 *     </tbody>
 *   </table>
 *
 *   The runtime injects a leading <th>/<td> with a radio (mode=single) or
 *   checkbox (mode=multi) into every <tr> and a Submit button in the
 *   <tfoot>. Clicking anywhere in a row toggles its control. Typing into
 *   the free-text row auto-selects it. Submit (or Enter inside the text
 *   input) returns:
 *     { id: "<tableId>-submit",
 *       type: "table-form",
 *       label: "<2 options>",
 *       data: { tableId, mode, selected: [{id,label}…], text: "…" | null } }
 *
 * Transport:
 *   The runtime POSTs the selection to /__ve-select on the same origin.
 *   That endpoint is provided by scripts/ve-select.py; when the page is
 *   opened directly via file:// the runtime falls back to a copy-to-
 *   clipboard overlay so the user can paste the JSON back to the agent.
 */
(function () {
  if (window.__veInit) return;
  window.__veInit = true;

  var params = new URLSearchParams(location.search);
  var loc = location.origin || '';
  var isInteractive =
    params.get('ve_select') === '1' ||
    /^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/i.test(loc);

  var sending = false;

  function buildOverlay() {
    var el = document.createElement('div');
    el.setAttribute('data-ve-overlay', '');
    el.style.cssText = [
      'position:fixed', 'inset:0',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(8,10,14,0.72)',
      'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
      'z-index:2147483647',
      'font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif',
      'color:#fff', 'padding:24px', 'text-align:center',
      'animation:veFadeIn 160ms ease-out both'
    ].join(';');
    var card = document.createElement('div');
    card.style.cssText = [
      'background:#15171c',
      'border:1px solid rgba(255,255,255,0.08)',
      'border-radius:14px',
      'padding:24px 28px',
      'max-width:560px',
      'min-width:320px',
      'box-shadow:0 20px 60px rgba(0,0,0,0.5)'
    ].join(';');
    el.appendChild(card);
    document.body.appendChild(el);
    return { root: el, card: card };
  }

  function injectStyles() {
    if (document.getElementById('__ve-styles')) return;
    var s = document.createElement('style');
    s.id = '__ve-styles';
    s.textContent = [
      '@keyframes veFadeIn { from {opacity:0} to {opacity:1} }',
      '@keyframes veSlideUp { from {opacity:0;transform:translateY(4px)} to {opacity:1;transform:translateY(0)} }',
      '[data-ve-id] { cursor:pointer; transition:outline-color 120ms ease, box-shadow 120ms ease, filter 120ms ease; }',
      // HTML elements with [data-ve-id]: rectangular outline on hover —
      // matches their bbox geometry (cards, table rows, divs, etc.).
      // Phase 1 of multi-select overhaul: hover and selected use the
      // SAME accent colour (`--ve-accent`, page-overridable; defaults to
      // currentColor for backwards compat). Hover adds a soft drop-shadow
      // glow in the same colour; selected has a solid outline without
      // the glow. This way the user sees one consistent "highlight"
      // colour and the glow distinguishes "hover" from "already selected".
      //
      // The glow blur radius is small (4px) on purpose — wider blurs
      // become a smeary band on long edges instead of a soft halo, and
      // pages can always override per-element via their own CSS.
      '[data-ve-id]:hover { outline:2px solid var(--ve-accent, currentColor); outline-offset:3px; filter: drop-shadow(0 0 4px var(--ve-accent, currentColor)); }',
      '[data-ve-id]:focus-visible { outline:2px solid var(--ve-accent, currentColor); outline-offset:3px; }',
      '[data-ve-id][data-ve-selected="1"] { outline:2px solid var(--ve-accent, currentColor); outline-offset:3px; }',
      // Hover-on-selected (HTML elements): keep the glow active so the
      // cursor still feels reactive over an already-picked element.
      '[data-ve-id][data-ve-selected="1"]:hover { filter: drop-shadow(0 0 4px var(--ve-accent, currentColor)); }',
      // SVG elements (Graphviz nodes/edges, geometric regions, etc.):
      // a rectangular outline around a circle / arrow / path looks wrong,
      // so suppress it and highlight the actual SHAPE instead. The
      // brightness filter is the safe default that preserves the original
      // colour palette; page-level CSS like `.ve-graph .node:hover circle`
      // wins on specificity for palette-specific recolouring.
      'svg [data-ve-id]:hover, svg [data-ve-id]:focus-visible, svg [data-ve-id]:hover *, svg [data-ve-id]:focus-visible *, svg [data-ve-id][data-ve-selected="1"], svg [data-ve-id][data-ve-selected="1"] * { outline:none !important; }',
      // Hover: brightness boost + soft glow (drop-shadow). The glow is
      // the visual signal that distinguishes hover from selected.
      'svg g[data-ve-id]:hover > circle,',
      'svg g[data-ve-id]:hover > ellipse,',
      'svg g[data-ve-id]:hover > polygon,',
      'svg g[data-ve-id]:hover > rect,',
      'svg g[data-ve-id]:hover > path,',
      'svg g[data-ve-id]:hover > polyline { filter: brightness(1.20) drop-shadow(0 0 4px var(--ve-accent, currentColor)); }',
      // Selected: same brightness boost as hover (same colour intent),
      // but NO glow — that absence is what tells the user "this is
      // already in the set, hovering would re-glow it".
      'svg g[data-ve-id][data-ve-selected="1"] > circle,',
      'svg g[data-ve-id][data-ve-selected="1"] > ellipse,',
      'svg g[data-ve-id][data-ve-selected="1"] > polygon,',
      'svg g[data-ve-id][data-ve-selected="1"] > rect,',
      'svg g[data-ve-id][data-ve-selected="1"] > path,',
      'svg g[data-ve-id][data-ve-selected="1"] > polyline { filter: brightness(1.20); }',
      // Hover-on-selected: the user is hovering an element they already
      // picked. Re-introduce the glow so the cursor still feels reactive
      // even on selected items. Without this combined-selector rule the
      // selected-only filter wins (same specificity as :hover, declared
      // later in the cascade) and the glow vanishes when the mouse moves
      // back over an already-selected element.
      'svg g[data-ve-id][data-ve-selected="1"]:hover > circle,',
      'svg g[data-ve-id][data-ve-selected="1"]:hover > ellipse,',
      'svg g[data-ve-id][data-ve-selected="1"]:hover > polygon,',
      'svg g[data-ve-id][data-ve-selected="1"]:hover > rect,',
      'svg g[data-ve-id][data-ve-selected="1"]:hover > path,',
      'svg g[data-ve-id][data-ve-selected="1"]:hover > polyline { filter: brightness(1.20) drop-shadow(0 0 4px var(--ve-accent, currentColor)); }',
      // Edge groups have a path + an arrowhead polygon. Hover and selected
      // both thicken; only hover adds the glow (handled by the rules above).
      'svg g.edge[data-ve-id]:hover > path { stroke-width: 2.4; opacity: 1; }',
      'svg g.edge[data-ve-id]:hover > polygon { opacity: 1; }',
      'svg g.edge[data-ve-id][data-ve-selected="1"] > path { stroke-width: 2.4; opacity: 1; }',
      'svg g.edge[data-ve-id][data-ve-selected="1"] > polygon { opacity: 1; }',
      // The hit-area twin path we inject (data-ve-hit="1") MUST stay
      // permanently invisible — never inherits hover stroke / filter from
      // page-level CSS. Without these !important resets, page CSS like
      // `.ve-graph svg .edge:hover path { stroke: var(--gold); }` would
      // override the twin\'s `stroke="transparent"` SVG attribute (CSS
      // wins over presentation attributes), leaving TWO overlapping gold
      // lines at the same coordinates → user sees a fat double / dashed
      // edge instead of a clean highlight.
      'svg path[data-ve-hit="1"] { stroke: transparent !important; fill: none !important; filter: none !important; }',
      // Phase 2/3 — default highlight for multi-click text selections.
      //
      // The text colour is FORCED to a near-black tone (`--ve-sel-text`)
      // because the highlight background is always a tint of the page's
      // accent colour. When the accent is gold/amber/orange (a common
      // editorial choice) and the page text is also a warm tone (e.g.
      // dark mode using `--gold` for body text shadows), the page text
      // colour and highlight tint sit close on the colour wheel and
      // selected text becomes nearly unreadable. Forcing the selected
      // text to near-black guarantees high contrast on every accent
      // because the highlight tint, by being mixed with `transparent`,
      // is always the LIGHTER end of the accent's luminosity range — and
      // black contrasts well against any light tint regardless of hue.
      //
      // Pages that need to override (e.g. a dark-on-dark accent palette
      // where black would be invisible) can set --ve-sel-text on :root
      // to any contrasting tone.
      ':root { --ve-sel-text: #14110b; }',
      '.ve-text-sel {',
      '  background: color-mix(in srgb, var(--ve-accent, #b8861f) 32%, transparent);',
      '  color: var(--ve-sel-text);',
      '  border-radius: 2px;',
      '  padding: 0 1px;',
      '  cursor: text;',
      '}',
      // Phase 3 — block-level highlight for depths 4-7 (paragraph,
      // section, chapter, all). Lighter background than .ve-text-sel
      // because it covers a much larger area and darker tones become
      // overpowering. The data-ve-text-sel-block attribute carries the
      // entryId, so multiple block selections can co-exist with
      // independent IDs. Same forced text colour as .ve-text-sel.
      '[data-ve-text-sel-block] {',
      '  background: color-mix(in srgb, var(--ve-accent, #b8861f) 16%, transparent);',
      '  color: var(--ve-sel-text);',
      '  border-radius: 4px;',
      '  outline: 1px solid color-mix(in srgb, var(--ve-accent, #b8861f) 50%, transparent);',
      '  outline-offset: 2px;',
      '}',
      // Block-level selections recursively repaint descendant elements
      // so their inherited colours don\'t override --ve-sel-text. Without
      // this rule, a paragraph painted at depth 4 would have black
      // outline + accent tint + still-original text colour because the
      // paragraph\'s child elements (links, code spans, .ve-math nodes)
      // each set their own `color`.
      '[data-ve-text-sel-block] *:not([data-ve-pnum]) { color: inherit; }',
      // Phase 3 — math sub-formula highlight for depths 1-3 inside
      // .ve-math (atom, group, whole formula). Slightly brighter than the
      // block highlight (since math atoms are tiny and need a sharper
      // contrast to read), but still lighter than the prose .ve-text-sel
      // because the highlight sits on top of KaTeX-rendered glyphs that
      // can themselves be small. The selector is intentionally generic
      // (not scoped to .ve-math) so it works even if the page wraps math
      // in [data-ve-math] without the .ve-math class.
      '[data-ve-math-sel] {',
      '  background: color-mix(in srgb, var(--ve-accent, #b8861f) 24%, transparent);',
      '  color: var(--ve-sel-text);',
      '  border-radius: 3px;',
      '  outline: 1px solid color-mix(in srgb, var(--ve-accent, #b8861f) 60%, transparent);',
      '  outline-offset: 1px;',
      '}',
      // KaTeX renders glyphs with explicit `color` on inner spans (italic
      // variables, operator glyphs, etc.). Force descendant inherit so
      // the math selection actually wins.
      '[data-ve-math-sel] * { color: inherit; }',
      // Mermaid nodes (handled separately because their .node class isn\'t
      // wrapped in [data-ve-id] until veSelectMermaid is wired):
      '.mermaid .node { cursor:pointer; }',
      '.mermaid .node:hover > * { filter:brightness(1.15); }',
      '[data-ve-overlay] button { font:inherit; }',
      // Paragraph-number marker in prose mode. Sized BIGGER than the
      // body text (1.05em) and bold, because monospace glyphs render
      // visually shorter than serif at the same point size — without the
      // size bump the marker sits below the baseline and looks like a
      // weak afterthought. The opacity stays modest (0.55) so the marker
      // still recedes when the reader is focused on the prose; hover
      // brightens it to 0.95 to confirm it\'s clickable.
      '.ve-pnum {',
      '  display:inline-block; vertical-align:baseline;',
      '  font:700 1.05em/1 ui-monospace,Menlo,Consolas,monospace;',
      '  color:currentColor; opacity:0.55;',
      '  margin-right:0.6em; padding:2px 7px;',
      '  border:1.5px solid currentColor; border-radius:5px;',
      '  text-decoration:none; user-select:none;',
      '  transition:opacity 120ms ease;',
      '}',
      '.ve-pnum:hover { opacity:0.95; }',
      // Depth-based paragraph indentation. The numberProse() function
      // stamps data-ve-pdepth (1..N) alongside data-ve-pnum; CSS keys
      // off it to indent each paragraph proportionally to its hierarchy
      // level. Unit is REM (root-relative) — using `em` would couple the
      // tab width to the element\'s own font-size, so an h2 at depth 2
      // would indent more than a p at the same depth. Rem keeps a depth
      // tab visually identical regardless of the element\'s typography.
      '[data-ve-prose] [data-ve-pdepth="1"] { margin-left: 1.5rem; }',
      '[data-ve-prose] [data-ve-pdepth="2"] { margin-left: 3rem; }',
      '[data-ve-prose] [data-ve-pdepth="3"] { margin-left: 4.5rem; }',
      '[data-ve-prose] [data-ve-pdepth="4"] { margin-left: 6rem; }',
      '[data-ve-prose] [data-ve-pdepth="5"] { margin-left: 7.5rem; }',
      '[data-ve-prose] [data-ve-pdepth="6"] { margin-left: 9rem; }',
      // The injected hover/selected outline adds an extra 8px padding.
      // Since we now use margin-left for indent, the inset box-shadow
      // still fires from the paragraph\'s left edge — exactly what the
      // user expects (hover ribbon hugs the indented block, not the
      // viewport edge).
      '[data-ve-prose] [data-ve-id]:hover { outline:none; box-shadow:inset 4px 0 0 currentColor; padding-left:8px; }',
      '[data-ve-prose] [data-ve-id] { transition:padding 120ms ease, box-shadow 120ms ease; padding-left:0; }',
      // Floating "Ask about this snippet" popup that appears over a
      // mouse text selection.
      '[data-ve-snippet-popup] {',
      '  position:absolute; z-index:2147483646;',
      '  background:#15171c; color:#fff;',
      '  border:1px solid rgba(255,255,255,0.1); border-radius:8px;',
      '  padding:6px; box-shadow:0 8px 24px rgba(0,0,0,0.35);',
      '  font:13px/1 system-ui,-apple-system,sans-serif;',
      '  animation:veSlideUp 140ms ease-out both;',
      '}',
      '[data-ve-snippet-popup] button {',
      '  background:#fff; color:#0f1115; border:0; cursor:pointer;',
      '  padding:7px 14px; border-radius:6px; font:600 13px/1 inherit;',
      '}',
      '[data-ve-snippet-popup] button + button {',
      '  margin-left:6px; background:transparent; color:#fff;',
      '  border:1px solid rgba(255,255,255,0.18); font-weight:500;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showSendingOverlay() {
    var ov = buildOverlay();
    ov.card.innerHTML =
      '<div style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:0.12em;text-transform:uppercase;opacity:0.55;margin-bottom:14px;">visual-explainer</div>' +
      '<div style="font-size:18px;font-weight:500;">Sending selection&hellip;</div>';
    return ov;
  }

  function showSentThenClose(label, overlay) {
    overlay.card.innerHTML =
      '<div style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:0.12em;text-transform:uppercase;opacity:0.55;margin-bottom:14px;">visual-explainer</div>' +
      '<div style="font-size:18px;font-weight:500;">Selection sent</div>' +
      '<div style="opacity:0.7;margin-top:10px;">' +
        escapeHtml(label || '(no label)') +
      '</div>' +
      '<div style="opacity:0.45;margin-top:18px;font-size:13px;">Returning to your agent&hellip;</div>';
    setTimeout(function () {
      try { window.close(); } catch (_) {}
      // window.close() is denied for tabs not opened by JS — leave a clean
      // "you can close this tab" page so the user is not staring at the
      // sending overlay forever.
      setTimeout(function () {
        if (document.visibilityState !== 'hidden') {
          document.title = 'Selection sent — you can close this tab';
          document.body.innerHTML =
            '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1115;color:#e8eaee;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;">' +
              '<div>' +
                '<div style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:0.12em;text-transform:uppercase;opacity:0.5;margin-bottom:14px;">visual-explainer</div>' +
                '<h1 style="font-weight:500;font-size:24px;margin:0 0 10px;">Selection sent</h1>' +
                '<p style="opacity:0.7;margin:0 0 16px;">You can close this tab.</p>' +
                '<code style="background:#1a1d23;padding:8px 14px;border-radius:8px;font-size:13px;">' +
                  escapeHtml(label || '') +
                '</code>' +
              '</div>' +
            '</div>';
        }
      }, 150);
    }, 220);
  }

  function showStaticFallback(payload, overlay) {
    var json = JSON.stringify(payload, null, 2);
    overlay.card.style.maxWidth = '640px';
    overlay.card.innerHTML =
      '<div style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:0.12em;text-transform:uppercase;opacity:0.55;margin-bottom:12px;">visual-explainer · selection</div>' +
      '<div style="text-align:left;font-size:14px;line-height:1.6;margin-bottom:12px;opacity:0.85;">' +
        'This page was opened directly (not via the agent runner), so the selection cannot be sent automatically. ' +
        'Copy the payload below and paste it back to your agent.' +
      '</div>' +
      '<pre id="ve-payload" style="background:#0c0e12;color:#e8eaee;padding:14px 16px;border-radius:10px;text-align:left;overflow:auto;font:13px/1.5 ui-monospace,Menlo,monospace;margin:0 0 14px;border:1px solid rgba(255,255,255,0.05);">' + escapeHtml(json) + '</pre>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="ve-cancel" style="background:transparent;color:#e8eaee;border:1px solid rgba(255,255,255,0.18);padding:8px 16px;border-radius:8px;cursor:pointer;">Cancel</button>' +
        '<button id="ve-copy" style="background:#fff;color:#0f1115;border:0;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:600;">Copy JSON</button>' +
      '</div>';
    overlay.root.querySelector('#ve-copy').addEventListener('click', function () {
      var btn = this;
      var done = function () { btn.textContent = 'Copied'; btn.disabled = true; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(done, function () { fallbackCopy(json); done(); });
      } else {
        fallbackCopy(json);
        done();
      }
    });
    overlay.root.querySelector('#ve-cancel').addEventListener('click', function () {
      overlay.root.remove();
      sending = false;
    });
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {}
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function postSelection(payload) {
    if (sending) return;
    sending = true;

    payload = payload || {};
    if (payload.id == null && payload.label == null && payload.type == null) {
      sending = false;
      return; // nothing meaningful to send
    }
    if (typeof payload.label === 'string') {
      payload.label = payload.label.replace(/\s+/g, ' ').trim().slice(0, 240);
    }

    if (!isInteractive) {
      // Page opened directly via file:// — there is no /__ve-select
      // endpoint to talk to, so fall back to the copy-to-clipboard overlay.
      var overlay = buildOverlay();
      showStaticFallback(payload, overlay);
      return;
    }

    // Interactive mode: fire-and-forget the POST and close the window
    // immediately. sendBeacon is designed exactly for "send-on-unload"
    // semantics — the browser keeps the request in flight even after the
    // document is gone. Falls back to fetch(keepalive:true) on the small
    // number of browsers that don't expose sendBeacon.
    var body = JSON.stringify(payload);
    var sent = false;
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: 'application/json' });
        sent = navigator.sendBeacon('/__ve-select', blob);
      } catch (_) {}
    }
    if (!sent) {
      try {
        fetch('/__ve-select', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      } catch (_) {}
    }

    // 30 ms is long enough for sendBeacon to hand the request off to the
    // network stack and short enough to feel instant.
    setTimeout(function () {
      try { window.close(); } catch (_) {}
      // If close was denied (tab not opened by JS), show the minimal
      // close-confirmation. With Chromium --app this never runs because
      // window.close() succeeds and the document is gone.
      setTimeout(function () {
        if (document.visibilityState !== 'hidden' && document.body) {
          document.title = 'Selection sent — close this tab';
          document.body.innerHTML =
            '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;'
            + 'background:#0f1115;color:#e8eaee;font:15px/1.5 system-ui,-apple-system,sans-serif;'
            + 'text-align:center;padding:24px;">'
            + '<div>'
              + '<div style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:0.12em;'
              + 'text-transform:uppercase;opacity:0.5;margin-bottom:14px;">visual-explainer</div>'
              + '<h1 style="font-weight:500;font-size:22px;margin:0 0 6px;">Selection sent</h1>'
              + '<p style="opacity:0.6;margin:0;">You can close this tab.</p>'
            + '</div>'
            + '</div>';
        }
      }, 120);
    }, 30);
  }

  // ─────────────────────────────────────────────────────────────────────
  // MULTI-SELECT STATE — phase 1 of TRDD-7a98 overhaul.
  //
  // veSelection is the chronological list of currently-checked items.
  // A click on any element-kind [data-ve-id] toggles its membership;
  // the user closes the window by clicking Submit/Exit (or hitting
  // Enter), not by individual clicks. ESC clears the multi-select set
  // but never touches form-mode checkboxes/radios.
  //
  // Legacy callers (table-form submit, text-snippet popup) still go
  // through the old single-shot postSelection() path until phases 4+
  // unify them; that path remains structurally identical, just under
  // a parallel API.
  // ─────────────────────────────────────────────────────────────────────
  var veSelection = [];
  window.veSelection = veSelection;

  function entryIdFor(payload) {
    // Stable identity within the selection set. Element-kind entries
    // collapse to their data-ve-id; future kinds (text/row/column/code)
    // will each compose their own id from kind + anchor.
    return 'element:' + (payload && payload.id);
  }

  function findSelectionIndex(entryId) {
    for (var i = 0; i < veSelection.length; i++) {
      if (veSelection[i].entryId === entryId) return i;
    }
    return -1;
  }

  function toggleElementSelection(payload) {
    if (!payload || !payload.id) return;
    var entry = {
      kind: 'element',
      entryId: entryIdFor(payload),
      id: payload.id,
      type: payload.type || null,
      label: payload.label || null,
      data: payload.data || null
    };
    var idx = findSelectionIndex(entry.entryId);
    if (idx >= 0) {
      veSelection.splice(idx, 1);
    } else {
      veSelection.push(entry);
    }
    repaintSelectedElements();
  }
  window.veToggle = toggleElementSelection;

  function repaintSelectedElements() {
    // Mark every [data-ve-id] with data-ve-selected="1" iff its id is
    // currently in veSelection. Linear pass — pages don't have thousands
    // of clickable elements, and this avoids tracking diffs.
    var inSet = {};
    for (var i = 0; i < veSelection.length; i++) {
      var e = veSelection[i];
      if (e && e.kind === 'element') inSet[e.id] = 1;
    }
    var all = document.querySelectorAll('[data-ve-id]');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var id = el.getAttribute('data-ve-id');
      if (inSet[id]) el.setAttribute('data-ve-selected', '1');
      else el.removeAttribute('data-ve-selected');
    }
    updateSubmitButtonsState();
  }

  function buildSubmissionPayload(kind) {
    // New wire format introduced in phase 1: a list of selections plus a
    // top-level kind ("submit" when there is at least one selection,
    // "exit" when the user closes with an empty set).
    //
    // We copy ALL fields per entry except `entryId` (internal dedupe key).
    // Earlier this function hard-coded the element-kind fields (id, type,
    // label, data) and dropped text-kind fields (text, depth, paragraphId,
    // paragraphText) on the floor — the agent saw `[{kind:"text"},
    // {kind:"text"}]` with no actual text. Spreading is the cleanest way
    // to keep the payload future-proof as new kinds (row/column/codeline)
    // arrive in later phases.
    var INTERNAL = {entryId: 1};
    var selections = [];
    for (var i = 0; i < veSelection.length; i++) {
      var e = veSelection[i];
      var out = {};
      for (var k in e) {
        if (INTERNAL[k]) continue;
        if (e[k] !== undefined) out[k] = e[k];
      }
      selections.push(out);
    }
    return {
      kind: kind || (selections.length ? 'submit' : 'exit'),
      count: selections.length,
      selections: selections
    };
  }

  function submitSelections(forcedKind) {
    if (sending) return;
    sending = true;
    var payload = buildSubmissionPayload(forcedKind);
    if (!isInteractive) {
      // file:// fallback — same overlay path as legacy postSelection
      // uses, but the payload is the new schema. The overlay's
      // Copy-JSON button still works because it stringifies whatever
      // we hand it.
      var overlay = buildOverlay();
      showStaticFallback(payload, overlay);
      return;
    }
    var body = JSON.stringify(payload);
    var sent = false;
    if (navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon('/__ve-select', new Blob([body], { type: 'application/json' }));
      } catch (_) {}
    }
    if (!sent) {
      try {
        fetch('/__ve-select', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      } catch (_) {}
    }
    setTimeout(function () {
      try { window.close(); } catch (_) {}
      setTimeout(function () {
        if (document.visibilityState !== 'hidden' && document.body) {
          document.title = 'Selection sent — close this tab';
          document.body.innerHTML =
            '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;'
            + 'background:#0f1115;color:#e8eaee;font:15px/1.5 system-ui,-apple-system,sans-serif;'
            + 'text-align:center;padding:24px;">'
            + '<div>'
              + '<div style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:0.12em;'
              + 'text-transform:uppercase;opacity:0.5;margin-bottom:14px;">visual-explainer</div>'
              + '<h1 style="font-weight:500;font-size:22px;margin:0 0 6px;">Selection sent</h1>'
              + '<p style="opacity:0.6;margin:0;">You can close this tab.</p>'
            + '</div>'
            + '</div>';
        }
      }, 120);
    }, 30);
  }
  window.veSubmit = function () { submitSelections('submit'); };
  window.veExit = function () { submitSelections('exit'); };

  function injectSubmitButtons() {
    if (!document.body) return;
    if (document.getElementById('ve-submit-tr')) return; // idempotent
    // Two physically mirrored buttons (top-right + bottom-left) so the
    // user can reach Submit/Exit without traversing the whole viewport
    // — important on large pages and on touch devices.
    var positions = [
      { id: 've-submit-tr', cssText: 'position:fixed;top:14px;right:14px;' },
      { id: 've-submit-bl', cssText: 'position:fixed;bottom:14px;left:14px;' }
    ];
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      var btn = document.createElement('button');
      btn.id = pos.id;
      btn.type = 'button';
      btn.setAttribute('data-ve-overlay', '1');
      btn.style.cssText =
        pos.cssText
        + 'z-index:2147483646;'
        + 'min-width:84px;padding:9px 14px;'
        + 'border-radius:8px;border:1px solid rgba(0,0,0,0.18);'
        + 'font:600 13px/1.2 system-ui,-apple-system,sans-serif;'
        + 'cursor:pointer;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,0.28);'
        + 'transition:background 120ms,color 120ms,box-shadow 120ms;';
      (function (b) {
        // Auto-derive kind from current selection size: empty → "exit",
        // any items → "submit". Calling veSubmit() / veExit() bypasses
        // this auto-derivation by forcing the kind, which is wrong for
        // the button click — the button is a single physical element,
        // its meaning depends on what's currently selected, not on which
        // function name we wired up.
        b.addEventListener('click', function () { submitSelections(); });
      })(btn);
      document.body.appendChild(btn);
    }
    updateSubmitButtonsState();
  }

  function updateSubmitButtonsState() {
    var n = veSelection.length;
    var btns = [document.getElementById('ve-submit-tr'), document.getElementById('ve-submit-bl')];
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!b) continue;
      if (n === 0) {
        b.textContent = 'Exit';
        b.style.background = 'rgba(255,255,255,0.92)';
        b.style.color = '#1f1a14';
      } else {
        b.textContent = 'Submit (' + n + ')';
        b.style.background = '#b8861f';   // accent gold (page can override via CSS)
        b.style.color = '#1f1a14';
      }
    }
  }

  // ESC clears multi-select; Enter triggers global Submit/Exit. Both
  // skip when an editable form control has focus, so they don't
  // hijack typing.
  function isEditableFocused() {
    var t = document.activeElement;
    if (!t) return false;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    if (t.isContentEditable) return true;
    return false;
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (veSelection.length === 0) return;
      // Phase 2: text-kind entries also need their wrapping spans
      // unwrapped from the DOM, otherwise the gold highlight stays
      // even though veSelection is empty. clearAllTextSelections()
      // walks DOM-side spans and is defined alongside the multi-click
      // handler below.
      clearAllTextSelections();
      veSelection.length = 0;
      repaintSelectedElements();
      // Reset multi-click chain so the next click starts depth=1.
      lastClickChain = null;
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Enter') {
      // Enter on a focused [data-ve-id] toggles that element (handled by
      // the existing focused-element handler below — let it run first).
      // Enter inside a form input belongs to the input.
      var t = document.activeElement;
      if (t && t.matches && t.matches('[data-ve-id]')) return;
      if (isEditableFocused()) return;
      ev.preventDefault();
      // Same as the button click — let buildSubmissionPayload auto-derive
      // kind from the current selection count instead of forcing 'submit'.
      submitSelections();
    }
  }, false);

  // Auto-inject buttons when DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSubmitButtons);
  } else {
    injectSubmitButtons();
  }

  function elementSelection(target) {
    var node = target.closest && target.closest('[data-ve-id]');
    if (!node) return null;
    var rawData = node.getAttribute('data-ve-data');
    var data = null;
    if (rawData) {
      try { data = JSON.parse(rawData); } catch (_) { data = { raw: rawData }; }
    }
    var label = node.getAttribute('data-ve-label');
    if (!label) {
      label = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    var sel = {
      id: node.getAttribute('data-ve-id'),
      type: node.getAttribute('data-ve-type') || 'element',
      label: label
    };
    if (data) sel.data = data;
    return sel;
  }

  function dragInProgress(target) {
    // Pan handlers (Mermaid + .ve-graph-viewport) add a temporary class;
    // respect it so a pan does not register as a click-to-select.
    var wrap = target.closest && target.closest('.mermaid-wrap, .ve-graph-viewport');
    return !!(wrap && wrap.classList.contains('is-panning'));
  }

  function isInteractiveControl(target) {
    return !!(target.closest &&
      target.closest('a[href], button, input, textarea, select, label, summary, [contenteditable="true"], .zoom-controls'));
  }

  function isInsideTableForm(target) {
    return !!(target.closest && target.closest('[data-ve-type="table-form"]'));
  }

  document.addEventListener(
    'click',
    function (ev) {
      if (sending) return;
      if (ev.defaultPrevented) return;
      if (ev.target.closest('[data-ve-overlay]')) return;
      if (isInteractiveControl(ev.target)) return;
      if (dragInProgress(ev.target)) return;
      // Inside a table-form, the form's own handlers manage row toggling
      // and submission — never auto-select on bare row click.
      if (isInsideTableForm(ev.target)) return;
      // Phase 2: inside [data-ve-prose], clicks on text content go to the
      // multi-click handler (handleProseClick at bubble phase) instead of
      // toggling the whole paragraph. The .ve-pnum number marker still
      // toggles the paragraph (it has [data-ve-id] and isn't text).
      if (ev.target.closest('[data-ve-prose]') && !ev.target.closest('.ve-pnum')) return;
      var sel = elementSelection(ev.target);
      if (!sel || !sel.id) return;
      ev.preventDefault();
      ev.stopPropagation();
      // Phase 1 of multi-select overhaul: clicks toggle membership in
      // veSelection instead of firing a single POST and closing the
      // window. Submit/Exit (the floating buttons or the Enter key)
      // is what closes the window now.
      toggleElementSelection(sel);
    },
    true
  );

  // Keyboard parity: Space on a focused [data-ve-id] toggles it.
  // (Enter is handled by the global submit handler unless focus is
  // exactly on a [data-ve-id], in which case it should also toggle.)
  document.addEventListener(
    'keydown',
    function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var t = document.activeElement;
      if (!t || !t.matches || !t.matches('[data-ve-id]')) return;
      if (isInteractiveControl(t)) return;
      var sel = elementSelection(t);
      if (!sel || !sel.id) return;
      ev.preventDefault();
      // Stop propagation so the global Enter handler doesn't ALSO
      // submit when the user is just toggling a focused element.
      ev.stopPropagation();
      toggleElementSelection(sel);
    },
    true
  );

  // Public API for direct-call sites.
  // Legacy `veSelect`: still maps to single-shot postSelection so
  // pages that call it programmatically (e.g. for non-element flows)
  // keep working; new code should call veToggle / veSubmit.
  window.veSelect = postSelection;

  window.veSelectMermaid = function (nodeId, label, extra) {
    var payload = {
      id: 've-mermaid-' + nodeId,
      type: 'mermaid-node',
      label: label || nodeId
    };
    if (extra) payload.data = extra;
    // Phase 1: mermaid nodes participate in the multi-select set.
    toggleElementSelection(payload);
  };

  window.veWireChart = function (chartInstance, opts) {
    if (!chartInstance) return;
    var chartId = (opts && opts.id) || 'chart';
    chartInstance.options = chartInstance.options || {};
    chartInstance.options.onClick = function (_evt, elements, chart) {
      if (!elements || !elements.length) return;
      var el = elements[0];
      var ds = chart.data.datasets[el.datasetIndex] || {};
      var label = chart.data.labels && chart.data.labels[el.index];
      // Phase 1: chart points participate in the multi-select set.
      toggleElementSelection({
        id: 've-chart-' + chartId + '-d' + el.datasetIndex + '-i' + el.index,
        type: 'chart-point',
        label: (ds.label ? ds.label + ' · ' : '') + (label != null ? String(label) : 'index ' + el.index),
        data: {
          chartId: chartId,
          datasetIndex: el.datasetIndex,
          datasetLabel: ds.label || null,
          index: el.index,
          xLabel: label != null ? label : null,
          value: Array.isArray(ds.data) ? ds.data[el.index] : null
        }
      });
    };
    try { chartInstance.update(); } catch (_) {}
  };

  // Make any [data-ve-id] focusable for keyboard users unless the author
  // already set tabindex (defer to authoring intent in those cases).
  function enhanceFocus() {
    var els = document.querySelectorAll('[data-ve-id]:not([data-ve-type="table-form"]):not([tabindex])');
    for (var i = 0; i < els.length; i++) {
      // Skip nodes that contain a table-form — the form's own controls
      // are tabbable and should not double up.
      if (els[i].querySelector && els[i].querySelector('[data-ve-type="table-form"]')) continue;
      els[i].setAttribute('tabindex', '0');
      if (!els[i].hasAttribute('role')) els[i].setAttribute('role', 'button');
    }
  }

  // ---------------------------------------------------------------------
  // Table-as-question (form selection)
  // ---------------------------------------------------------------------

  function initTableForm(table) {
    if (table.__veFormInit) return;
    table.__veFormInit = true;

    var tableId = table.getAttribute('data-ve-id') || ('table-' + Math.random().toString(36).slice(2, 8));
    var mode = (table.getAttribute('data-ve-mode') || 'single').toLowerCase();
    if (mode !== 'multi') mode = 'single';
    var inputType = mode === 'multi' ? 'checkbox' : 'radio';
    var groupName = 've-form-' + tableId;
    var label = table.getAttribute('data-ve-label') || 'Make a selection';

    var rows = table.querySelectorAll('tbody > tr[data-ve-row-id]');
    if (!rows.length) return;

    // Inject the leading "select" header cell if the author left it out.
    var thead = table.querySelector('thead tr');
    if (thead && !thead.querySelector('[data-ve-form-head]')) {
      var th = document.createElement('th');
      th.setAttribute('data-ve-form-head', '');
      th.setAttribute('scope', 'col');
      th.style.width = '1%';
      th.style.whiteSpace = 'nowrap';
      th.textContent = mode === 'multi' ? 'Pick' : 'Choose';
      thead.insertBefore(th, thead.firstChild);
    }

    rows.forEach(function (row) {
      var rowId = row.getAttribute('data-ve-row-id');
      var rowLabel = row.getAttribute('data-ve-row-label')
        || (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      var isText = row.getAttribute('data-ve-row-text') === '1';

      // Insert leading cell with the form control.
      var cell = document.createElement('td');
      cell.setAttribute('data-ve-form-cell', '');
      cell.style.width = '1%';
      cell.style.whiteSpace = 'nowrap';
      cell.style.verticalAlign = 'middle';
      cell.style.textAlign = 'center';

      var input = document.createElement('input');
      input.type = inputType;
      input.name = groupName;
      input.value = rowId;
      input.setAttribute('data-ve-control', '');
      if (isText) input.setAttribute('data-ve-text-control', '');
      input.setAttribute('aria-label', rowLabel);

      cell.appendChild(input);
      row.insertBefore(cell, row.firstChild);

      // Make the whole row toggle the control (except clicks on the text
      // input itself, which should focus & not toggle).
      row.addEventListener('click', function (ev) {
        if (ev.target.closest('input, textarea, button, a, label, select')) return;
        toggleRow(row, mode);
      });

      // Free-text rows: typing auto-selects the control; Enter submits.
      if (isText) {
        var textInput = row.querySelector('input[type="text"], textarea');
        if (textInput) {
          textInput.setAttribute('data-ve-text-input', '');
          textInput.addEventListener('input', function () {
            input.checked = true;
            updateSubmitState(table);
          });
          textInput.addEventListener('focus', function () {
            input.checked = true;
            updateSubmitState(table);
          });
          textInput.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              submitTableForm(table);
            }
          });
        }
      }

      input.addEventListener('change', function () {
        updateSubmitState(table);
      });
    });

    // Submit row in <tfoot>.
    var tfoot = table.querySelector('tfoot');
    if (!tfoot) {
      tfoot = document.createElement('tfoot');
      table.appendChild(tfoot);
    }
    var firstRow = rows[0];
    var colCount = (firstRow.children.length) || 2;
    var submitTr = document.createElement('tr');
    submitTr.setAttribute('data-ve-form-footer', '');
    var submitTd = document.createElement('td');
    submitTd.colSpan = colCount;
    submitTd.style.textAlign = 'right';
    submitTd.style.padding = '14px 12px';
    submitTd.innerHTML =
      '<span data-ve-form-status style="opacity:0.6;font-size:13px;margin-right:12px;">No selection yet</span>' +
      '<button type="button" data-ve-form-submit ' +
      'style="font:600 14px/1 inherit;background:currentColor;color:transparent;'
        + 'border:0;padding:9px 18px;border-radius:8px;cursor:pointer;'
        + 'box-shadow:inset 0 0 0 9999px rgba(0,0,0,0);">'
      + '<span style="color:#fff;mix-blend-mode:difference;">Submit</span>'
      + '</button>';
    submitTr.appendChild(submitTd);
    tfoot.appendChild(submitTr);

    var btn = submitTr.querySelector('[data-ve-form-submit]');
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      submitTableForm(table);
    });

    // Initialise submit state.
    updateSubmitState(table);

    // Expose label for the payload.
    table.__veFormLabel = label;
    table.__veFormMode = mode;
    table.__veFormId = tableId;
  }

  function toggleRow(row, mode) {
    var input = row.querySelector('input[data-ve-control]');
    if (!input) return;
    if (mode === 'multi') {
      input.checked = !input.checked;
    } else {
      input.checked = true;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function updateSubmitState(table) {
    var checked = table.querySelectorAll('tbody input[data-ve-control]:checked');
    var status = table.querySelector('[data-ve-form-status]');
    var btn = table.querySelector('[data-ve-form-submit]');
    if (status) {
      if (checked.length === 0) {
        status.textContent = 'No selection yet';
      } else if (checked.length === 1) {
        status.textContent = '1 selected';
      } else {
        status.textContent = checked.length + ' selected';
      }
    }
    if (btn) {
      btn.disabled = checked.length === 0;
      btn.style.opacity = checked.length === 0 ? '0.5' : '1';
      btn.style.cursor = checked.length === 0 ? 'not-allowed' : 'pointer';
    }
  }

  function submitTableForm(table) {
    var mode = table.__veFormMode || 'single';
    var tableId = table.__veFormId || (table.getAttribute('data-ve-id') || 'table');
    var question = table.__veFormLabel || 'Selection';
    var checked = Array.prototype.slice.call(table.querySelectorAll('tbody input[data-ve-control]:checked'));
    if (!checked.length) return;

    var selected = [];
    var freeText = null;
    checked.forEach(function (input) {
      var row = input.closest('tr');
      var rowId = row.getAttribute('data-ve-row-id');
      var rowLabel = row.getAttribute('data-ve-row-label')
        || (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (input.hasAttribute('data-ve-text-control')) {
        var textInput = row.querySelector('[data-ve-text-input]');
        var textValue = textInput ? String(textInput.value || '').trim() : '';
        freeText = textValue || null;
        if (textValue) {
          selected.push({ id: rowId, label: rowLabel, text: textValue });
        }
      } else {
        selected.push({ id: rowId, label: rowLabel });
      }
    });

    if (!selected.length && !freeText) return;

    var summary;
    if (mode === 'single') {
      summary = (selected[0] && (selected[0].text || selected[0].label)) || 'Selection';
    } else {
      var parts = selected.map(function (s) { return s.text || s.label; });
      summary = parts.length === 1
        ? parts[0]
        : parts.length + ' choices: ' + parts.slice(0, 3).join(', ') + (parts.length > 3 ? '…' : '');
    }

    postSelection({
      id: 've-table-' + tableId + '-submit',
      type: 'table-form',
      label: summary,
      data: {
        tableId: tableId,
        question: question,
        mode: mode,
        selected: selected,
        text: freeText
      }
    });
  }

  function initAllTableForms() {
    var tables = document.querySelectorAll('table[data-ve-type="table-form"]');
    for (var i = 0; i < tables.length; i++) initTableForm(tables[i]);
  }

  // ---------------------------------------------------------------------
  // Prose mode: paragraph numbering + text-snippet selection
  // ---------------------------------------------------------------------

  var HEADING_RE = /^H([1-6])$/;
  var PARA_TAGS = { P: 1, BLOCKQUOTE: 1, LI: 0, PRE: 0 }; // P/BQ get full numbering; LI/PRE only if [data-ve-prose-list]

  function numberSection(parts) {
    return parts.filter(function (n) { return n > 0; }).join('.');
  }

  function makeNumberMarker(num) {
    var marker = document.createElement('a');
    marker.className = 've-pnum';
    marker.setAttribute('href', '#ve-' + num);
    marker.setAttribute('id', 've-' + num);
    marker.setAttribute('aria-label', 'Paragraph ' + num);
    marker.setAttribute('data-ve-pnum-marker', '1');
    marker.textContent = num;
    return marker;
  }

  function initProse(container) {
    if (container.__veProseInit) return;
    container.__veProseInit = true;

    var counters = [0, 0, 0, 0, 0, 0]; // h1..h6 levels
    var paraCounter = 0;
    var lastHeadingLevel = 0;
    var orderIndex = 0;

    var nodes = Array.prototype.slice.call(
      container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote')
    );

    nodes.forEach(function (node) {
      // Skip our own injected markers
      if (node.closest('[data-ve-overlay], [data-ve-snippet-popup]')) return;

      var hMatch = HEADING_RE.exec(node.tagName);
      if (hMatch) {
        var level = parseInt(hMatch[1], 10);
        counters[level - 1]++;
        for (var i = level; i < counters.length; i++) counters[i] = 0;
        lastHeadingLevel = level;
        paraCounter = 0;
        orderIndex++;

        var hnum = numberSection(counters);
        if (!hnum) return;

        node.setAttribute('data-ve-pnum', hnum);
        // data-ve-pdepth = number of segments in the pnum (e.g. "1.2.1" = 3).
        // Read by the CSS rules above to indent the element by depth.
        node.setAttribute('data-ve-pdepth', String(hnum.split('.').length));
        if (!node.hasAttribute('data-ve-id')) {
          node.setAttribute('data-ve-id', 've-section-' + hnum);
          node.setAttribute('data-ve-type', 'section');
          node.setAttribute(
            'data-ve-label',
            'Section ' + hnum + ' — ' + (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
          );
        }
        if (!node.querySelector(':scope > .ve-pnum')) {
          node.insertBefore(makeNumberMarker(hnum), node.firstChild);
        }
      } else if (PARA_TAGS[node.tagName]) {
        paraCounter++;
        orderIndex++;
        var pnum = (numberSection(counters.slice(0, lastHeadingLevel)) || '0') + '.' + paraCounter;
        node.setAttribute('data-ve-pnum', pnum);
        node.setAttribute('data-ve-pdepth', String(pnum.split('.').length));
        node.setAttribute('data-ve-pnum-order', String(orderIndex));
        if (!node.hasAttribute('data-ve-id')) {
          node.setAttribute('data-ve-id', 've-para-' + pnum);
          node.setAttribute('data-ve-type', 'paragraph');
          node.setAttribute(
            'data-ve-label',
            'Paragraph ' + pnum + ' — ' + (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
          );
        }
        if (!node.querySelector(':scope > .ve-pnum')) {
          node.insertBefore(makeNumberMarker(pnum), node.firstChild);
        }
      }
    });
  }

  function initAllProse() {
    var containers = document.querySelectorAll('[data-ve-prose]');
    for (var i = 0; i < containers.length; i++) initProse(containers[i]);
  }

  // ---------------------------------------------------------------------
  // Math / LaTeX (KaTeX + mhchem, lazy-loaded from CDN)
  // ---------------------------------------------------------------------

  var KATEX_VERSION = '0.16.9';
  var KATEX_BASE = 'https://cdn.jsdelivr.net/npm/katex@' + KATEX_VERSION + '/dist';
  var katexLoading = null;

  // Default macros covering the contemporary math notation that KaTeX does
  // not ship out-of-the-box (mostly the physics LaTeX package, tensor
  // shortcuts, bold vectors, set-theory blackboard letters, differential
  // operators, and a lightweight SI-unit pair).
  //
  // `\vec` is intentionally NOT overridden — KaTeX's default (small over-
  // arrow) is the conventional notation in many fields. Bold-vector folks
  // get \bv / \bvec / \vct / \hatv. Same for matrices: \mat / \bmat.
  //
  // Authors override or extend these per-page via `window.veKatexMacros`
  // (set BEFORE the runtime initialises math) or per-element via the
  // `data-tex-macros='{"\\foo":"\\bar"}'` attribute on a `.ve-math` node.
  var KATEX_DEFAULT_MACROS = {
    // ----- bold-vector / matrix conventions (additive to \vec / \mathbf) -----
    '\\bv':       '\\boldsymbol{#1}',
    '\\bvec':     '\\boldsymbol{#1}',
    '\\vct':      '\\boldsymbol{#1}',
    '\\hatv':     '\\hat{\\boldsymbol{#1}}',
    '\\unitvec':  '\\hat{\\boldsymbol{#1}}',
    '\\mat':      '\\boldsymbol{#1}',
    '\\bmat':     '\\boldsymbol{#1}',
    '\\T':        '^{\\mathsf{T}}',          // transpose, e.g. \mat A\T
    '\\inv':      '^{-1}',
    '\\hc':       '^{\\dagger}',             // hermitian conjugate (avoid clobbering \dag)

    // ----- tensor notation (physics) -----
    // \tensor{T}{^a_b} → T^a_b ; full mixed-index spacing falls back to
    // KaTeX's normal sup/sub rules: T^a{}_b{}^c writes correctly.
    '\\tensor':   '#1#2',
    '\\indices':  '#1',
    // Christoffel-style: \Gamma_{ab}^{c} also works directly.

    // ----- physics package (operators) -----
    '\\dd':       '\\mathrm{d}',
    '\\dv':       '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
    '\\pdv':      '\\frac{\\partial #1}{\\partial #2}',
    '\\fdv':      '\\frac{\\delta #1}{\\delta #2}',
    '\\dvn':      '\\frac{\\mathrm{d}^{#1}#2}{\\mathrm{d}#3^{#1}}',
    '\\pdvn':     '\\frac{\\partial^{#1}#2}{\\partial #3^{#1}}',
    '\\grad':     '\\boldsymbol{\\nabla}',
    '\\divv':     '\\boldsymbol{\\nabla}\\cdot',
    '\\curl':     '\\boldsymbol{\\nabla}\\times',
    '\\laplacian':'\\nabla^{2}',
    '\\dalembertian': '\\Box',

    // ----- physics package (delimiters / norms) -----
    '\\norm':     '\\left\\lVert #1 \\right\\rVert',
    '\\abs':      '\\left| #1 \\right|',
    '\\set':      '\\left\\{ #1 \\right\\}',
    '\\floor':    '\\left\\lfloor #1 \\right\\rfloor',
    '\\ceil':     '\\left\\lceil #1 \\right\\rceil',
    '\\inner':    '\\left\\langle #1, #2 \\right\\rangle',
    '\\eval':     '\\left. #1 \\right|',

    // ----- physics package (quantum / Dirac) -----
    '\\bra':      '\\left\\langle #1 \\right|',
    '\\ket':      '\\left| #1 \\right\\rangle',
    '\\braket':   '\\left\\langle #1 \\middle| #2 \\right\\rangle',
    '\\matrixel': '\\left\\langle #1 \\middle| #2 \\middle| #3 \\right\\rangle',
    '\\dyad':     '\\left| #1 \\right\\rangle\\!\\left\\langle #2 \\right|',
    '\\expval':   '\\left\\langle #1 \\right\\rangle',
    '\\comm':     '\\left[ #1, #2 \\right]',
    '\\anticomm': '\\left\\{ #1, #2 \\right\\}',
    '\\poissonbracket': '\\left\\{ #1, #2 \\right\\}',

    // ----- set theory / number systems -----
    '\\R':        '\\mathbb{R}',
    '\\Z':        '\\mathbb{Z}',
    '\\N':        '\\mathbb{N}',
    '\\Q':        '\\mathbb{Q}',
    '\\C':        '\\mathbb{C}',
    '\\F':        '\\mathbb{F}',
    '\\K':        '\\mathbb{K}',
    '\\H':        '\\mathbb{H}',     // quaternions
    '\\E':        '\\mathbb{E}',     // expectation / Euclidean space
    '\\P':        '\\mathbb{P}',     // probability / projective space

    // ----- common set / logic shortcuts -----
    '\\given':    '\\,\\middle|\\,',
    '\\suchthat': '\\;\\big|\\;',
    '\\Iff':      '\\Longleftrightarrow',
    '\\Implies':  '\\Longrightarrow',
    '\\impliedby':'\\Longleftarrow',
    '\\defeq':    '\\coloneqq',
    '\\eqdef':    '\\eqqcolon',

    // ----- complex analysis (\Re, \Im, \arg are KaTeX builtins, kept as-is) -----
    '\\Real':     '\\operatorname{Re}',      // upright alternative
    '\\Imag':     '\\operatorname{Im}',

    // ----- statistics (\Pr is a KaTeX builtin, kept as-is) -----
    '\\Var':      '\\operatorname{Var}',
    '\\Cov':      '\\operatorname{Cov}',
    '\\Cor':      '\\operatorname{Corr}',
    '\\Prob':     '\\operatorname{Pr}',

    // ----- linear algebra -----
    '\\rank':     '\\operatorname{rank}',
    '\\tr':       '\\operatorname{tr}',
    '\\Tr':       '\\operatorname{Tr}',
    '\\diag':     '\\operatorname{diag}',
    '\\spn':      '\\operatorname{span}',
    '\\nullspace':'\\operatorname{null}',
    '\\range':    '\\operatorname{range}',
    '\\sgn':      '\\operatorname{sgn}',

    // ----- SI units (lightweight siunitx-like) -----
    '\\SI':       '#1\\,\\mathrm{#2}',
    '\\unit':     '\\mathrm{#1}',
    '\\num':      '#1',
    '\\si':       '\\mathrm{#1}',
    '\\degC':     '^{\\circ}\\mathrm{C}',
    '\\degF':     '^{\\circ}\\mathrm{F}',
    '\\angstrom': '\\text{\\AA}',

    // ----- common math shortcuts -----
    '\\half':     '\\tfrac{1}{2}',
    '\\third':    '\\tfrac{1}{3}',
    '\\quarter':  '\\tfrac{1}{4}',
    '\\half2':    '\\tfrac{1}{2}',
    '\\eps':      '\\varepsilon',
    '\\veps':     '\\varepsilon',
    '\\phi2':     '\\varphi',
    '\\implies':  '\\Rightarrow',
    '\\iff':      '\\Leftrightarrow',

    // ====================================================================
    // Granular math selection macros — these route through KaTeX's
    // \htmlData (which we've enabled via `trust`) so the rendered HTML
    // gets `data-ve-id` / `data-ve-type` / `data-ve-label` directly.
    // The runtime's existing [data-ve-id] click handler picks them up.
    //
    // Naming convention recommended for matrix cells:
    //   \vecell{matA-r1c2}{Element a₁₂ of matrix A}{a_{12}}
    // The "rNcM" suffix lets the agent compute "select row N" from any
    // cell click, and lets the user mouse-highlight a whole row/column.
    //
    // Generic form: \veid{id}{type}{label}{content}
    // ====================================================================

    '\\veid':     '\\htmlData{ve-id=#1,ve-type=#2,ve-label=#3}{#4}',
    '\\vecell':   '\\htmlData{ve-id=#1,ve-type=matrix-cell,ve-label=#2}{#3}',
    '\\veelem':   '\\htmlData{ve-id=#1,ve-type=matrix-cell,ve-label=#2}{#3}',
    '\\verow':    '\\htmlData{ve-id=#1,ve-type=matrix-row,ve-label=#2}{#3}',
    '\\vecol':    '\\htmlData{ve-id=#1,ve-type=matrix-column,ve-label=#2}{#3}',
    '\\veidx':    '\\htmlData{ve-id=#1,ve-type=index,ve-label=#2}{#3}',
    '\\vesub':    '\\htmlData{ve-id=#1,ve-type=subscript,ve-label=#2}{#3}',
    '\\vesup':    '\\htmlData{ve-id=#1,ve-type=superscript,ve-label=#2}{#3}',
    '\\vebound':  '\\htmlData{ve-id=#1,ve-type=bound,ve-label=#2}{#3}',
    '\\veterm':   '\\htmlData{ve-id=#1,ve-type=term,ve-label=#2}{#3}',
    '\\vefactor': '\\htmlData{ve-id=#1,ve-type=factor,ve-label=#2}{#3}',
    '\\vesum':    '\\htmlData{ve-id=#1,ve-type=sum,ve-label=#2}{#3}',
    '\\veprod':   '\\htmlData{ve-id=#1,ve-type=product,ve-label=#2}{#3}',
    '\\veint':    '\\htmlData{ve-id=#1,ve-type=integral,ve-label=#2}{#3}',
    '\\velim':    '\\htmlData{ve-id=#1,ve-type=limit,ve-label=#2}{#3}',
    '\\veop':     '\\htmlData{ve-id=#1,ve-type=operator,ve-label=#2}{#3}',
    '\\vegrp':    '\\htmlData{ve-id=#1,ve-type=group,ve-label=#2}{#3}',
    '\\vevar':    '\\htmlData{ve-id=#1,ve-type=variable,ve-label=#2}{#3}',
    '\\veconst':  '\\htmlData{ve-id=#1,ve-type=constant,ve-label=#2}{#3}',
    '\\vetensor': '\\htmlData{ve-id=#1,ve-type=tensor,ve-label=#2}{#3}',
    '\\vevec':    '\\htmlData{ve-id=#1,ve-type=vector,ve-label=#2}{#3}',
    '\\vemat':    '\\htmlData{ve-id=#1,ve-type=matrix,ve-label=#2}{#3}',
    '\\vesymb':   '\\htmlData{ve-id=#1,ve-type=symbol,ve-label=#2}{#3}'
  };

  function buildKatexMacros(extra) {
    var merged = {};
    for (var k in KATEX_DEFAULT_MACROS) merged[k] = KATEX_DEFAULT_MACROS[k];
    var pageMacros = (typeof window.veKatexMacros === 'object' && window.veKatexMacros) || null;
    if (pageMacros) for (var k2 in pageMacros) merged[k2] = pageMacros[k2];
    if (extra && typeof extra === 'object') {
      for (var k3 in extra) merged[k3] = extra[k3];
    }
    return merged;
  }

  function loadKatex() {
    if (window.katex) return Promise.resolve(window.katex);
    if (katexLoading) return katexLoading;
    katexLoading = new Promise(function (resolve, reject) {
      // CSS first so layout settles before render.
      if (!document.querySelector('link[data-ve-katex-css]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = KATEX_BASE + '/katex.min.css';
        link.setAttribute('data-ve-katex-css', '1');
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      }
      var script = document.createElement('script');
      script.src = KATEX_BASE + '/katex.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = function () {
        // Best-effort: mhchem (chemistry) + copy-tex (right-click copies
        // back the original LaTeX source — invaluable when iterating on a
        // paper figure). Failure of either is non-fatal.
        var mh = document.createElement('script');
        mh.src = KATEX_BASE + '/contrib/mhchem.min.js';
        mh.crossOrigin = 'anonymous';
        mh.onload = function () {
          var ct = document.createElement('script');
          ct.src = KATEX_BASE + '/contrib/copy-tex.min.js';
          ct.crossOrigin = 'anonymous';
          ct.onload = function () { resolve(window.katex); };
          ct.onerror = function () { resolve(window.katex); };
          document.head.appendChild(ct);
        };
        mh.onerror = function () { resolve(window.katex); };
        document.head.appendChild(mh);
      };
      script.onerror = function () { reject(new Error('Failed to load KaTeX')); };
      document.head.appendChild(script);
    });
    return katexLoading;
  }

  function renderMathElement(el, idx, katex) {
    if (el.__veMathRendered) return;
    el.__veMathRendered = true;

    var displayMode =
      el.classList.contains('ve-math--block') ||
      el.tagName === 'DIV' ||
      el.getAttribute('data-ve-math-display') === 'block';
    var isChem = el.classList.contains('ve-math--chem');

    var src = el.getAttribute('data-tex');
    if (src == null) src = (el.textContent || '').trim();
    if (!src) return;

    var renderSrc = src;
    if (isChem && src.indexOf('\\ce{') !== 0 && src.indexOf('\\pu{') !== 0) {
      renderSrc = '\\ce{' + src + '}';
    }

    // Per-element macro overrides via data-tex-macros='{"\\foo":"\\bar"}'
    var perElementMacros = null;
    var macrosAttr = el.getAttribute('data-tex-macros');
    if (macrosAttr) {
      try { perElementMacros = JSON.parse(macrosAttr); }
      catch (_) { /* ignore bad JSON; fall back to defaults */ }
    }

    try {
      katex.render(renderSrc, el, {
        displayMode: displayMode,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
        // Whitelist ONLY the html-* commands so authors can attach
        // semantic data attributes via \vecell / \veidx / etc. \href is
        // explicitly NOT trusted (would let TikZ/math sources inject links).
        trust: function (ctx) {
          var allowed = {
            '\\htmlClass': 1,
            '\\htmlData': 1,
            '\\htmlId': 1,
            '\\htmlStyle': 1
          };
          return !!allowed[ctx.command];
        },
        macros: buildKatexMacros(perElementMacros)
      });
    } catch (err) {
      el.textContent = src;
      el.style.color = 'crimson';
      el.title = 'KaTeX render error: ' + (err && err.message ? err.message : err);
      return;
    }

    var fid = 'formula-' + (idx + 1);
    if (!el.hasAttribute('data-ve-id')) {
      el.setAttribute('data-ve-id', 've-math-' + fid);
      el.setAttribute('data-ve-type', 'math-formula');
      el.setAttribute(
        'data-ve-label',
        (isChem ? 'Chemistry' : 'Formula') + ' — ' + src.slice(0, 100)
      );
      try {
        el.setAttribute(
          'data-ve-data',
          JSON.stringify({ latex: src, chem: !!isChem, formulaId: fid })
        );
      } catch (_) {}
    }
    // Mark as a snippet-source so mouse-highlighting inside it opens the
    // snippet popup, even outside a [data-ve-prose] container.
    el.setAttribute('data-ve-snippet-source', '1');
    if (!el.hasAttribute('data-ve-math-source')) {
      el.setAttribute('data-ve-math-source', src);
    }
  }

  function initAllMath() {
    var elements = document.querySelectorAll('.ve-math, [data-ve-math]');
    if (!elements.length) return;
    loadKatex().then(function (katex) {
      for (var i = 0; i < elements.length; i++) {
        renderMathElement(elements[i], i, katex);
      }
    }).catch(function (err) {
      // KaTeX failed to load (offline / CSP): leave content as-is so the
      // raw LaTeX is at least visible and copy-pastable.
      console.warn('[ve-runtime] math rendering disabled:', err);
    });
  }

  // ---------------------------------------------------------------------
  // TikZ diagrams (TikZJax — full TikZ + chemfig + physics + circuitikz)
  // ---------------------------------------------------------------------

  var tikzLoading = null;

  function loadTikzJax() {
    if (window.__tikzjaxLoaded) return Promise.resolve(true);
    if (tikzLoading) return tikzLoading;
    tikzLoading = new Promise(function (resolve, reject) {
      // TikZJax injects its own CSS for the rendered SVGs.
      var script = document.createElement('script');
      script.src = 'https://tikzjax.com/v1/tikzjax.js';
      script.async = true;
      script.onload = function () { window.__tikzjaxLoaded = true; resolve(true); };
      script.onerror = function () { reject(new Error('Failed to load TikZJax')); };
      document.head.appendChild(script);
    });
    return tikzLoading;
  }

  function prepareTikzElement(el, idx) {
    if (el.__veTikzInit) return;
    el.__veTikzInit = true;

    // Pull the TikZ source: prefer data-tikz attribute, then text content.
    var src = el.getAttribute('data-tikz');
    if (src == null) src = (el.textContent || '').trim();
    if (!src) return;

    // Wrap bare \chemfig / non-tikzpicture sources so TikZJax accepts them.
    var needsWrap = src.indexOf('\\begin{tikzpicture}') === -1
                 && src.indexOf('\\begin{document}') === -1;
    var wrapped = needsWrap
      ? '\\begin{tikzpicture}\n' + src + '\n\\end{tikzpicture}'
      : src;

    // Internal ID used to namespace child geometric-region [data-ve-id]s.
    // We store it on a non-clickable attribute (data-ve-internal-id) and
    // deliberately do NOT set data-ve-id on the wrapper itself: that
    // would make the figure background / whitespace fire a "whole-
    // diagram" selection on click, which is almost never the intent.
    // Authors who want background clicks can set data-ve-id explicitly
    // before render — we honour that.
    if (!el.hasAttribute('data-ve-internal-id')) {
      el.setAttribute('data-ve-internal-id', 've-tikz-' + (idx + 1));
    }
    el.setAttribute('data-ve-snippet-source', '1');
    if (!el.hasAttribute('data-ve-tikz-source')) {
      el.setAttribute('data-ve-tikz-source', src);
    }

    // Replace the element's contents with the magic <script type="text/tikz">
    // tag that TikZJax looks for. TikZJax mutates the DOM in place.
    el.textContent = '';
    var scriptTag = document.createElement('script');
    scriptTag.type = 'text/tikz';
    scriptTag.textContent = wrapped;
    el.appendChild(scriptTag);
  }

  function initAllTikz() {
    var elements = document.querySelectorAll('.ve-tikz, [data-ve-tikz]');
    if (!elements.length) return;
    // Prepare DOM first so the <script type="text/tikz"> tags exist before
    // TikZJax's auto-discovery runs on load.
    for (var i = 0; i < elements.length; i++) prepareTikzElement(elements[i], i);
    // Schedule the region-overlay watcher for any wrapper that declares
    // semantic regions; runs concurrently with TikZJax's render.
    for (var k = 0; k < elements.length; k++) watchForTikzRender(elements[k]);
    loadTikzJax().catch(function (err) {
      console.warn('[ve-runtime] tikz rendering disabled:', err);
      // Restore raw source so the user at least sees the LaTeX.
      for (var j = 0; j < elements.length; j++) {
        var el = elements[j];
        var src = el.getAttribute('data-ve-tikz-source');
        if (src) el.textContent = src;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Semantic geometric regions — invisible SVG overlay on top of a
  // TikZJax-rendered figure. Each region is a clickable [data-ve-id]
  // with the SEMANTIC identity Claude needs to act ("the square upon the
  // hypotenuse", not "<path d='…'/>" without meaning).
  // ---------------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function createRegionElement(r) {
    if (r.shape === 'polygon' && Array.isArray(r.points)) {
      var poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', r.points.map(function (p) { return p.join(','); }).join(' '));
      return poly;
    }
    if (r.shape === 'circle') {
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(r.cx));
      c.setAttribute('cy', String(r.cy));
      c.setAttribute('r', String(r.r));
      return c;
    }
    if (r.shape === 'ellipse') {
      var e = document.createElementNS(SVG_NS, 'ellipse');
      e.setAttribute('cx', String(r.cx));
      e.setAttribute('cy', String(r.cy));
      e.setAttribute('rx', String(r.rx));
      e.setAttribute('ry', String(r.ry));
      return e;
    }
    if (r.shape === 'rect') {
      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(r.x));
      rect.setAttribute('y', String(r.y));
      rect.setAttribute('width', String(r.w != null ? r.w : r.width));
      rect.setAttribute('height', String(r.h != null ? r.h : r.height));
      return rect;
    }
    if (r.shape === 'path' && r.d) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', String(r.d));
      return p;
    }
    if (r.shape === 'line' && Array.isArray(r.from) && Array.isArray(r.to)) {
      // Render as a thick invisible polyline so a "line" region has a
      // clickable hit area.
      var line = document.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('points', r.from.join(',') + ' ' + r.to.join(','));
      line.setAttribute('stroke-width', String(r.thickness || 0.4));
      line.setAttribute('fill', 'none');
      return line;
    }
    return null;
  }

  function applyTikzRegions(wrapperEl, svgEl, regions) {
    var vbAttr = wrapperEl.getAttribute('data-ve-tikz-viewbox');
    var vb = vbAttr ? vbAttr.trim().split(/\s+/).map(Number) : null;
    if (!vb || vb.length !== 4 || vb.some(isNaN)) {
      var svgVb = svgEl.getAttribute('viewBox');
      if (svgVb) vb = svgVb.trim().split(/\s+/).map(Number);
    }
    if (!vb || vb.length !== 4 || vb.some(isNaN)) {
      console.warn('[ve-runtime] no usable viewBox for TikZ region overlay; specify data-ve-tikz-viewbox');
      return;
    }

    var debug = wrapperEl.getAttribute('data-ve-tikz-debug') === '1';

    // Make wrapper position-relative so the absolute overlay aligns.
    var cs = window.getComputedStyle(wrapperEl);
    if (cs.position === 'static') wrapperEl.style.position = 'relative';

    var existing = wrapperEl.querySelector('[data-ve-tikz-overlay]');
    if (existing) existing.remove();

    var overlay = document.createElementNS(SVG_NS, 'svg');
    overlay.setAttribute('viewBox', vb.join(' '));
    overlay.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    overlay.setAttribute('data-ve-tikz-overlay', '1');
    overlay.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
      + 'overflow:visible;';

    var diagramId =
      wrapperEl.getAttribute('data-ve-id')
      || wrapperEl.getAttribute('data-ve-internal-id')
      || 've-tikz-?';
    var diagramTikz = wrapperEl.getAttribute('data-ve-tikz-source') || null;

    regions.forEach(function (r) {
      if (!r || !r.id) return;
      var el = createRegionElement(r);
      if (!el) return;

      el.setAttribute('data-ve-id', diagramId + '-region-' + r.id);
      el.setAttribute('data-ve-type', 'geometric-region');
      el.setAttribute('data-ve-label', r.label || r.id);
      try {
        el.setAttribute('data-ve-data', JSON.stringify({
          regionId: r.id,
          regionLabel: r.label || r.id,
          regionShape: r.shape,
          diagramId: diagramId,
          fullDiagramLatex: diagramTikz
        }));
      } catch (_) {}

      // Hit area: invisible by default (transparent fill, no stroke), but
      // accepts pointer events so the click registers. On hover, fill in
      // a subtle accent so the user sees what they're picking.
      el.style.cssText =
        'pointer-events:auto;cursor:pointer;'
        + 'fill:' + (debug ? 'rgba(220,38,38,0.28)' : 'transparent') + ';'
        + 'stroke:' + (debug ? 'rgba(220,38,38,0.85)' : 'transparent') + ';'
        + 'stroke-width:' + (debug ? '0.06' : '0') + ';'
        + 'transition:fill 120ms ease, stroke 120ms ease;';

      el.addEventListener('mouseenter', function () {
        if (debug) return;
        el.style.fill = 'currentColor';
        el.style.fillOpacity = '0.18';
        el.style.stroke = 'currentColor';
        el.style.strokeOpacity = '0.65';
        el.style.strokeWidth = '0.05';
      });
      el.addEventListener('mouseleave', function () {
        if (debug) return;
        el.style.fill = 'transparent';
        el.style.stroke = 'transparent';
      });

      overlay.appendChild(el);
    });

    wrapperEl.appendChild(overlay);
  }

  // ---------------------------------------------------------------------
  // Directed graphs via viz.js (Graphviz WASM)
  // ---------------------------------------------------------------------

  var VIZ_URL = 'https://cdn.jsdelivr.net/npm/@viz-js/viz/lib/viz-standalone.js';
  var vizLoading = null;
  var vizInstance = null;

  function loadViz() {
    if (vizInstance) return Promise.resolve(vizInstance);
    if (vizLoading) return vizLoading;
    vizLoading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = VIZ_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = function () {
        if (!window.Viz || typeof window.Viz.instance !== 'function') {
          reject(new Error('@viz-js/viz did not expose Viz.instance'));
          return;
        }
        window.Viz.instance().then(function (inst) {
          vizInstance = inst;
          resolve(inst);
        }, reject);
      };
      script.onerror = function () { reject(new Error('Failed to load viz.js')); };
      document.head.appendChild(script);
    });
    return vizLoading;
  }

  // Replace a Graphviz <text> label that looks like LaTeX math ($…$ or
  // \(...\)) with a <foreignObject> holding the KaTeX-rendered HTML. The
  // math stays inside the SVG (not absolute-positioned) so the graph
  // remains a self-contained, exportable figure for paper inclusion.
  function rerenderTextAsMath(textEl, latex, katex) {
    var fontSize = parseFloat(textEl.getAttribute('font-size'))
                || parseFloat(window.getComputedStyle(textEl).fontSize)
                || 14;

    // textEl.getBBox() returns the actual rendered bounding box (top-left
    // origin), which is the only reliable way to position the
    // foreignObject — the <text> element's `y` attribute is the BASELINE,
    // not the geometric centre, so naive `y - height/2` placement pushes
    // the math down by ~30 % of the line-height. getBBox() avoids that.
    var bbox;
    try {
      bbox = textEl.getBBox();
    } catch (e) {
      var fx = parseFloat(textEl.getAttribute('x')) || 0;
      var fy = parseFloat(textEl.getAttribute('y')) || 0;
      bbox = {
        x: fx - fontSize * 0.4,
        y: fy - fontSize * 0.85,
        width: fontSize * 0.8,
        height: fontSize * 1.0
      };
    }

    // Pad generously so KaTeX (which has its own internal margins) doesn't
    // get clipped, then re-centre on the original text's geometric centre.
    var width = Math.max(bbox.width * 2.4, fontSize * 3);
    var height = Math.max(bbox.height * 2.4, fontSize * 2.2);
    var cx = bbox.x + bbox.width / 2;
    var cy = bbox.y + bbox.height / 2;

    var fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', String(cx - width / 2));
    fo.setAttribute('y', String(cy - height / 2));
    fo.setAttribute('width', String(width));
    fo.setAttribute('height', String(height));
    fo.setAttribute('overflow', 'visible');
    fo.setAttribute('data-ve-math-label', '1');

    var div = document.createElement('div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.style.cssText =
      'display:flex;align-items:center;justify-content:center;'
      + 'width:100%;height:100%;font-size:' + fontSize + 'px;';
    try {
      katex.render(latex, div, {
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
        trust: function (ctx) {
          var allowed = { '\\htmlClass':1, '\\htmlData':1, '\\htmlId':1, '\\htmlStyle':1 };
          return !!allowed[ctx.command];
        },
        macros: buildKatexMacros()
      });
    } catch (e) {
      div.textContent = latex;
    }
    fo.appendChild(div);

    textEl.parentNode.insertBefore(fo, textEl);
    textEl.style.display = 'none';
  }

  function applyGraphMathLabels(svgEl) {
    var texts = svgEl.querySelectorAll('text');
    if (!texts.length) return;
    var pending = [];
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      var content = (t.textContent || '').trim();
      var m = /^\$([\s\S]+?)\$$/.exec(content) || /^\\\(([\s\S]+?)\\\)$/.exec(content);
      if (!m) continue;
      pending.push({ el: t, latex: m[1] });
    }
    if (!pending.length) return;
    loadKatex().then(function (katex) {
      pending.forEach(function (item) {
        rerenderTextAsMath(item.el, item.latex, katex);
      });
    }).catch(function () {});
  }

  function decorateGraphSvg(wrapperEl, svgEl) {
    var dotSrc = wrapperEl.getAttribute('data-ve-graph-source') || null;

    // Internal id used to namespace nodes / edges / regions. We deliberately
    // do NOT set data-ve-id on the wrapper itself — that would make clicks
    // on the figure background / whitespace fire a "whole-diagram" selection,
    // which is almost never what the user wants. Authors who DO want a
    // background-clickable figure can set data-ve-id explicitly on the
    // wrapper before render; we only honor it if it was already there.
    var diagramId = wrapperEl.getAttribute('data-ve-id');
    if (!diagramId) {
      if (typeof window.__veGraphCounter !== 'number') window.__veGraphCounter = 0;
      window.__veGraphCounter += 1;
      diagramId = 've-graph-' + window.__veGraphCounter;
      // intentionally not exposed as a click target
    }

    // Walk node + edge groups. Graphviz emits <g class="node"> per node
    // and <g class="edge"> per edge. We auto-assign data-ve-id to every
    // one (deriving from Graphviz's emitted <title> like "i3->j5"), so
    // authors don't have to write id="…" on every DOT edge to make them
    // clickable. Author-supplied ids that already start with "ve-" win.
    var groups = svgEl.querySelectorAll('g.node, g.edge');
    var autoCounters = { node: 0, edge: 0 };
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var isEdge = g.classList.contains('edge');
      var kind = isEdge ? 'edge' : 'node';
      var titleEl = g.querySelector('title');
      var titleText = titleEl ? titleEl.textContent.trim() : '';

      // Resolve a stable id: explicit ve-* DOT id wins; otherwise derive
      // from <title> content (turns "i3->j5" into "ve-edge-i3-to-j5"); if
      // even that's empty, fall back to a counter.
      var id = g.getAttribute('id');
      if (!id || id.indexOf('ve-') !== 0) {
        autoCounters[kind] += 1;
        var slug = titleText
          .replace(/->/g, '-to-')
          .replace(/--/g, '-to-')
          .replace(/[^A-Za-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '');
        if (!slug) slug = String(autoCounters[kind]);
        id = 've-' + kind + '-' + slug;
        g.setAttribute('id', id);
      }

      // Human label: prefer the visible <text> for nodes; fall back to
      // the title for edges (which usually says "from->to") or to the id
      // as last resort.
      var label = titleText || id.replace(/^ve-(node|edge)-/, '');
      var textEl = g.querySelector('text');
      if (textEl && textEl.textContent.trim()) label = textEl.textContent.trim();

      g.setAttribute('data-ve-id', id);
      g.setAttribute('data-ve-type', isEdge ? 'graph-edge' : 'graph-node');
      g.setAttribute('data-ve-label', label);
      g.setAttribute('data-ve-data', JSON.stringify({
        graphId: diagramId,
        kind: isEdge ? 'edge' : 'node',
        dotSource: dotSrc
      }));
      g.style.cursor = 'pointer';

      // Edge hit-area expansion: Graphviz strokes edge paths at 1–2 px,
      // and SVG default `pointer-events: visiblePainted` only registers
      // clicks on those few painted pixels. The visual line stays thin
      // (good design), but precise clicks become frustrating. Add an
      // invisible 14 px-wide twin path as a hit area beneath the visible
      // path — same `d`, transparent stroke, `pointer-events: stroke` so
      // clicks anywhere within ~7 px of the line bubble to the edge <g>.
      if (isEdge) {
        addEdgeHitArea(g);
      }
    }
  }

  function addEdgeHitArea(edgeGroup) {
    var paths = edgeGroup.querySelectorAll('path');
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      // Don't double-clone our own hit-area paths.
      if (p.getAttribute('data-ve-hit') === '1') continue;
      // Skip if this path is the one we just inserted (in a prior pass).
      if (p.previousSibling
          && p.previousSibling.nodeType === 1
          && p.previousSibling.getAttribute
          && p.previousSibling.getAttribute('data-ve-hit') === '1') continue;
      var clone = p.cloneNode(false);
      clone.setAttribute('data-ve-hit', '1');
      clone.setAttribute('stroke', 'transparent');
      clone.setAttribute('stroke-width', '14');
      clone.setAttribute('stroke-linecap', 'round');
      clone.setAttribute('stroke-linejoin', 'round');
      clone.setAttribute('fill', 'none');
      clone.setAttribute('pointer-events', 'stroke');
      clone.style.cursor = 'pointer';
      // Insert BEFORE the visible path so the visible stroke paints on
      // top (z-order). Pointer-events still reach the hit clone for
      // clicks landing in the empty space around the visible stroke.
      p.parentNode.insertBefore(clone, p);
    }
  }

  function renderGraph(wrapperEl) {
    if (wrapperEl.__veGraphInit) return;
    wrapperEl.__veGraphInit = true;

    var src = wrapperEl.getAttribute('data-dot') || (wrapperEl.textContent || '').trim();
    if (!src) return;
    wrapperEl.setAttribute('data-ve-graph-source', src);
    wrapperEl.setAttribute('data-ve-snippet-source', '1');

    var engine = wrapperEl.getAttribute('data-ve-graph-engine') || 'dot';

    loadViz().then(function (viz) {
      var svgEl;
      try {
        svgEl = viz.renderSVGElement(src, { engine: engine });
      } catch (err) {
        wrapperEl.textContent = src;
        wrapperEl.style.color = 'crimson';
        wrapperEl.title = 'Graphviz error: ' + (err && err.message ? err.message : err);
        return;
      }
      // Make the SVG fluid in its container.
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.style.maxWidth = '100%';
      svgEl.style.height = 'auto';
      wrapperEl.textContent = '';
      wrapperEl.appendChild(svgEl);
      decorateGraphSvg(wrapperEl, svgEl);
      // Re-render math labels last; the SVG is in the DOM so getBBox()
      // works for sizing the foreignObject containers.
      applyGraphMathLabels(svgEl);
      // Wrap the SVG in a zoom/pan viewport. Author can opt out by
      // setting data-ve-graph-zoom="off" on the wrapper.
      if (wrapperEl.getAttribute('data-ve-graph-zoom') !== 'off') {
        enableGraphZoom(wrapperEl, svgEl);
      }
    }).catch(function (err) {
      // Restore raw source so the user at least sees the DOT.
      console.warn('[ve-runtime] graph rendering disabled:', err);
      wrapperEl.textContent = src;
    });
  }

  function initAllGraphs() {
    var elements = document.querySelectorAll('.ve-graph, [data-ve-graph]');
    if (!elements.length) return;
    for (var i = 0; i < elements.length; i++) renderGraph(elements[i]);
  }

  // ---------------------------------------------------------------------
  // Graph zoom + pan controls — wraps a rendered Graphviz SVG in a
  // viewport with overflow:hidden + transform-based zoom + drag-to-pan.
  // Same UX pattern as the Mermaid `.diagram-shell`.
  // ---------------------------------------------------------------------

  function enableGraphZoom(wrapperEl, svgEl) {
    if (wrapperEl.__veZoomInit) return;
    wrapperEl.__veZoomInit = true;

    var minZoom = 0.2;
    var maxZoom = 8;
    var zoom = 1;
    var panX = 0;
    var panY = 0;

    // Wrap the SVG in a viewport div so overflow can be clipped while we
    // CSS-transform the SVG itself for zoom/pan.
    var viewport = document.createElement('div');
    viewport.className = 've-graph-viewport';
    viewport.style.cssText = [
      'position:relative',
      'overflow:hidden',
      'width:100%',
      'cursor:grab',
      'user-select:none',
      'touch-action:none',
      'border-radius:6px'
    ].join(';');

    svgEl.parentNode.insertBefore(viewport, svgEl);
    viewport.appendChild(svgEl);

    // Reset SVG sizing — it now lives inside the viewport and is
    // CSS-transformed for zoom/pan. The `width:100%` keeps the natural
    // unzoomed size matching the viewport's width.
    svgEl.style.maxWidth = 'none';
    svgEl.style.transformOrigin = '0 0';
    svgEl.style.transition = 'transform 80ms ease-out';
    svgEl.style.willChange = 'transform';

    // Match viewport height to the SVG's natural rendered height so the
    // "fit" baseline is the unscaled view.
    function refreshViewportHeight() {
      var h = svgEl.getBoundingClientRect().height;
      if (h > 0) viewport.style.height = h + 'px';
    }
    refreshViewportHeight();
    new ResizeObserver(refreshViewportHeight).observe(svgEl);

    function apply() {
      svgEl.style.transform =
        'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
      if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
    }

    function clampZoom(z) { return Math.max(minZoom, Math.min(maxZoom, z)); }

    function fit() { zoom = 1; panX = 0; panY = 0; apply(); }

    function zoomAtPoint(factor, viewportX, viewportY) {
      var newZoom = clampZoom(zoom * factor);
      if (newZoom === zoom) return;
      // Keep the point under the cursor stationary across the zoom.
      var ratio = newZoom / zoom;
      panX = viewportX - (viewportX - panX) * ratio;
      panY = viewportY - (viewportY - panY) * ratio;
      zoom = newZoom;
      apply();
    }

    // Controls overlay (top-right corner of the viewport).
    var controls = document.createElement('div');
    controls.className = 've-graph-controls';
    controls.style.cssText = [
      'position:absolute',
      'top:8px',
      'right:8px',
      'z-index:10',
      'display:flex',
      'align-items:center',
      'gap:2px',
      'background:rgba(15,17,21,0.82)',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'border:1px solid rgba(255,255,255,0.08)',
      'border-radius:8px',
      'padding:4px',
      'font:600 12px/1 ui-monospace,Menlo,monospace',
      'pointer-events:auto'
    ].join(';');

    var btnBaseStyle =
      'background:transparent;border:0;color:#fff;width:30px;height:30px;'
      + 'cursor:pointer;border-radius:5px;font:inherit;font-size:14px;'
      + 'display:inline-flex;align-items:center;justify-content:center;';

    function makeBtn(label, title, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = 0;
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.style.cssText = btnBaseStyle;
      b.addEventListener('mouseenter', function () { b.style.background = 'rgba(255,255,255,0.14)'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        onClick();
      });
      return b;
    }

    var zoomLabel = document.createElement('span');
    zoomLabel.textContent = '100%';
    zoomLabel.style.cssText =
      'color:rgba(255,255,255,0.7);padding:0 8px;display:inline-flex;'
      + 'align-items:center;font-size:11px;letter-spacing:0.04em;';

    controls.appendChild(makeBtn('+', 'Zoom in (Ctrl+wheel up)',
      function () { zoomAtPoint(1.18, viewport.clientWidth / 2, viewport.clientHeight / 2); }));
    controls.appendChild(makeBtn('−', 'Zoom out (Ctrl+wheel down)',
      function () { zoomAtPoint(1 / 1.18, viewport.clientWidth / 2, viewport.clientHeight / 2); }));
    controls.appendChild(makeBtn('1:1', 'Reset to 100%', fit));
    controls.appendChild(zoomLabel);

    viewport.appendChild(controls);

    // Ctrl/Cmd + wheel → zoom at the cursor location.
    viewport.addEventListener('wheel', function (ev) {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      var rect = viewport.getBoundingClientRect();
      var px = ev.clientX - rect.left;
      var py = ev.clientY - rect.top;
      var factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAtPoint(factor, px, py);
    }, { passive: false });

    // Click-and-drag to pan. Skip drag start if the press lands on a
    // selectable element (so node clicks still register cleanly). A small
    // movement threshold (4 px) prevents micro-jitter from cancelling the
    // click.
    var dragging = false;
    var dragMoved = false;
    var sx = 0, sy = 0, spx = 0, spy = 0;

    viewport.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      if (ev.target.closest('.ve-graph-controls, button, a[href]')) return;
      dragging = true;
      dragMoved = false;
      sx = ev.clientX; sy = ev.clientY;
      spx = panX; spy = panY;
      svgEl.style.transition = 'none';
    });

    document.addEventListener('mousemove', function (ev) {
      if (!dragging) return;
      var dx = ev.clientX - sx;
      var dy = ev.clientY - sy;
      if (!dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        dragMoved = true;
        viewport.classList.add('is-panning');  // tells ve-runtime click handler to ignore the upcoming click
        viewport.style.cursor = 'grabbing';
      }
      if (dragMoved) {
        panX = spx + dx;
        panY = spy + dy;
        apply();
      }
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      viewport.style.cursor = 'grab';
      svgEl.style.transition = 'transform 80ms ease-out';
      // Defer removing the panning class so the click event that fires
      // immediately after mouseup sees it (and is therefore ignored).
      setTimeout(function () { viewport.classList.remove('is-panning'); }, 50);
    });

    // Double-click anywhere in the viewport background → fit.
    viewport.addEventListener('dblclick', function (ev) {
      if (ev.target.closest('g.node, g.edge, .ve-graph-controls')) return;
      ev.preventDefault();
      fit();
    });

    // Keyboard shortcuts when the viewport is focused.
    viewport.tabIndex = 0;
    viewport.addEventListener('keydown', function (ev) {
      if (ev.key === '+' || ev.key === '=') { zoomAtPoint(1.18, viewport.clientWidth / 2, viewport.clientHeight / 2); ev.preventDefault(); }
      else if (ev.key === '-') { zoomAtPoint(1 / 1.18, viewport.clientWidth / 2, viewport.clientHeight / 2); ev.preventDefault(); }
      else if (ev.key === '0') { fit(); ev.preventDefault(); }
    });

    apply();
  }

  function watchForTikzRender(wrapperEl) {
    var regionsJson = wrapperEl.getAttribute('data-ve-tikz-regions');
    if (!regionsJson) return;
    var regions;
    try {
      regions = JSON.parse(regionsJson);
    } catch (err) {
      console.warn('[ve-runtime] invalid data-ve-tikz-regions JSON:', err);
      return;
    }
    if (!Array.isArray(regions) || !regions.length) return;

    var attempt = function () {
      // TikZJax replaces the <script type="text/tikz"> with the rendered
      // <svg>. Wait for that swap.
      var svg = wrapperEl.querySelector(':scope > svg, :scope svg');
      if (svg && svg.getAttribute('viewBox')) {
        applyTikzRegions(wrapperEl, svg, regions);
        return true;
      }
      return false;
    };

    if (attempt()) return;

    var observer = new MutationObserver(function () {
      if (attempt()) observer.disconnect();
    });
    observer.observe(wrapperEl, { childList: true, subtree: true });

    // Hard timeout (TikZJax may fail to load or take a long time on cold
    // WASM fetch). Stop watching after 60 s so we don't leak observers.
    setTimeout(function () { observer.disconnect(); }, 60000);
  }

  // ---------------------------------------------------------------------
  // Text-snippet selection: floating popup over a mouse selection.
  // Only active inside [data-ve-prose] so it never fights with normal
  // copy-paste behaviour on diagram pages.
  // ---------------------------------------------------------------------

  var snippetPopup = null;
  var snippetSeq = 0;

  function clearSnippetPopup() {
    if (snippetPopup) {
      snippetPopup.remove();
      snippetPopup = null;
    }
  }

  function paragraphFromNode(node) {
    if (!node) return null;
    var el = node.nodeType === 3 ? node.parentElement : node;
    return el && el.closest ? el.closest('[data-ve-pnum]') : null;
  }

  function showSnippetPopup() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) { clearSnippetPopup(); return; }
    var text = sel.toString().trim();
    if (text.length < 1) { clearSnippetPopup(); return; }

    var range = sel.getRangeAt(0);
    var anchor = range.commonAncestorContainer;
    var anchorEl = (anchor.nodeType === 3 ? anchor.parentElement : anchor);

    // The popup activates inside any opt-in snippet source: prose
    // containers, math formulas, TikZ diagrams, or anything explicitly
    // marked with [data-ve-snippet-source].
    var snippetHost = anchorEl && anchorEl.closest
      ? anchorEl.closest('[data-ve-prose], [data-ve-snippet-source], .ve-math, [data-ve-math], .ve-tikz, [data-ve-tikz]')
      : null;
    if (!snippetHost) { clearSnippetPopup(); return; }

    // Detect whether we're inside a rendered math formula or a TikZ figure.
    var mathHost = anchorEl && anchorEl.closest
      ? anchorEl.closest('.ve-math, [data-ve-math]')
      : null;
    var tikzHost = anchorEl && anchorEl.closest
      ? anchorEl.closest('.ve-tikz, [data-ve-tikz]')
      : null;

    var paraEl = paragraphFromNode(range.startContainer) || paragraphFromNode(range.endContainer);
    var pnum = paraEl ? paraEl.getAttribute('data-ve-pnum') : null;
    var paraText = paraEl ? (paraEl.textContent || '').replace(/\s+/g, ' ').trim() : null;

    // Math-mode payload preferences.
    var mathLatex = mathHost
      ? (mathHost.getAttribute('data-ve-math-source') || mathHost.getAttribute('data-tex') || null)
      : null;
    var mathFormulaId = mathHost ? (mathHost.getAttribute('data-ve-id') || null) : null;
    var mathFormulaLabel = mathHost ? (mathHost.getAttribute('data-ve-label') || null) : null;
    var isChem = mathHost && mathHost.classList && mathHost.classList.contains('ve-math--chem');

    var rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { clearSnippetPopup(); return; }

    if (!snippetPopup) {
      snippetPopup = document.createElement('div');
      snippetPopup.setAttribute('data-ve-snippet-popup', '');
      document.body.appendChild(snippetPopup);
    }

    snippetPopup.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = mathHost
      ? 'Ask about this part of the formula'
      : (tikzHost ? 'Ask about this part of the diagram' : 'Ask about this snippet');
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    snippetPopup.appendChild(btn);
    snippetPopup.appendChild(cancel);

    var top = rect.top + window.scrollY - 44;
    var left = rect.left + window.scrollX + (rect.width / 2) - (snippetPopup.offsetWidth / 2 || 90);
    if (top < 8) top = rect.bottom + window.scrollY + 8;
    if (left < 8) left = 8;
    snippetPopup.style.top = top + 'px';
    snippetPopup.style.left = left + 'px';

    btn.addEventListener('click', function () {
      snippetSeq++;
      var truncated = text.length > 120 ? text.slice(0, 117) + '…' : text;
      var payload;
      if (mathHost) {
        payload = {
          id: (mathFormulaId || 've-math-?') + '-snippet-' + snippetSeq,
          type: isChem ? 'chem-snippet' : 'math-snippet',
          label: truncated,
          data: {
            text: text,
            fullFormulaLatex: mathLatex,
            fullFormulaLabel: mathFormulaLabel,
            formulaId: mathFormulaId,
            chem: !!isChem,
            paragraphId: pnum,
            paragraphNumber: pnum
          }
        };
      } else if (tikzHost) {
        var tikzSrc = tikzHost.getAttribute('data-ve-tikz-source')
                   || tikzHost.getAttribute('data-tikz')
                   || null;
        var tikzId = tikzHost.getAttribute('data-ve-id') || null;
        var tikzLabel = tikzHost.getAttribute('data-ve-label') || null;
        payload = {
          id: (tikzId || 've-tikz-?') + '-snippet-' + snippetSeq,
          type: 'tikz-snippet',
          label: truncated,
          data: {
            text: text,
            fullDiagramLatex: tikzSrc,
            fullDiagramLabel: tikzLabel,
            diagramId: tikzId,
            paragraphId: pnum,
            paragraphNumber: pnum
          }
        };
      } else {
        payload = {
          id: 've-snippet-' + (pnum || 'p?') + '-' + snippetSeq,
          type: 'text-snippet',
          label: truncated,
          data: {
            text: text,
            paragraphId: pnum,
            paragraphNumber: pnum,
            paragraphText: paraText
          }
        };
      }
      postSelection(payload);
      clearSnippetPopup();
    });
    cancel.addEventListener('click', function () {
      clearSnippetPopup();
      window.getSelection && window.getSelection().removeAllRanges();
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Phase 2 — multi-click text selection inside [data-ve-prose].
  //
  // 1 click  = single character / grapheme at the click point
  // 2 clicks (within 500ms) = the surrounding word (Intl.Segmenter)
  // 3 clicks = a "block" — non-whitespace run, stopping at operators /
  //            brackets, but keeping comma/dot inside numbers (locale-
  //            aware: 10,000.00 in en-US, 10.000,00 in it/de/...)
  //
  // Selections are added to veSelection as kind:'text' entries. Per
  // TRDD §3.4, multi-click NEVER deselects — only mouse-drag (Phase 4)
  // does. Each new click within the chain REPLACES the previous entry
  // at a deeper depth, so triple-clicking ends with one block, not
  // three fragments. The first click in a new chain (different text
  // node, > 500ms, or > 8px from the previous click) starts at depth=1.
  // ─────────────────────────────────────────────────────────────────────

  var lastClickChain = null; // {textNode, charIdx, depth, entryId, time}
  var CLICK_GRACE_MS = 500;
  var CLICK_GRACE_PX = 8;
  var veLocale = null;

  function getLocale() {
    if (veLocale) return veLocale;
    var raw = (document.documentElement.getAttribute('lang') || 'en');
    var lang = String(raw).toLowerCase().split(/[-_]/)[0];
    // Per TRDD §3.4, only `<html lang>` drives locale — never
    // navigator.language (unreliable on Safari mobile per user). If
    // unrecognised, default to US format.
    var european = ['it','de','nl','da','nb','pt','pl','tr','vi','id','is','el','ru','uk','bg','hr','cs','hu','lv','mk','ro','sk','sl','bs','mt','sr'];
    var french   = ['fr','fi','et','lt','sv'];
    if (french.indexOf(lang) >= 0)   veLocale = {lang: lang, decSep: ',', thouSep: ' '};
    else if (european.indexOf(lang) >= 0) veLocale = {lang: lang, decSep: ',', thouSep: '.'};
    else                                  veLocale = {lang: lang, decSep: '.', thouSep: ','};
    return veLocale;
  }

  function isInsideProseText(target) {
    if (!target || !target.closest) return false;
    if (target.closest('[data-ve-overlay], button, input, textarea, select, .ve-pnum, [data-ve-snippet-popup]')) return false;
    return !!target.closest('[data-ve-prose]');
  }

  function caretInfoAt(x, y) {
    var pos = null;
    if (document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (p) pos = {node: p.offsetNode, offset: p.offset};
    } else if (document.caretRangeFromPoint) {
      var r = document.caretRangeFromPoint(x, y);
      if (r) pos = {node: r.startContainer, offset: r.startOffset};
    }
    if (!pos || !pos.node || pos.node.nodeType !== Node.TEXT_NODE) return null;
    return pos;
  }

  function buildLetterRange(node, idx) {
    var text = node.textContent;
    if (!text || text.length === 0) return null;
    var i = Math.max(0, Math.min(idx, text.length - 1));
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      var segs = new Intl.Segmenter(getLocale().lang, {granularity: 'grapheme'}).segment(text);
      for (var s of segs) {
        if (i >= s.index && i < s.index + s.segment.length) {
          var r = document.createRange();
          r.setStart(node, s.index);
          r.setEnd(node, s.index + s.segment.length);
          return r;
        }
      }
    }
    var r2 = document.createRange();
    r2.setStart(node, i);
    r2.setEnd(node, Math.min(i + 1, text.length));
    return r2;
  }

  function buildWordRange(node, idx) {
    var text = node.textContent;
    if (!text || text.length === 0) return null;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      var segs = new Intl.Segmenter(getLocale().lang, {granularity: 'word'});
      var fallback = null;
      for (var s of segs.segment(text)) {
        if (idx >= s.index && idx < s.index + s.segment.length) {
          if (s.isWordLike) {
            var r = document.createRange();
            r.setStart(node, s.index);
            r.setEnd(node, s.index + s.segment.length);
            return r;
          }
          fallback = s;
        }
      }
      if (fallback) {
        var r2 = document.createRange();
        r2.setStart(node, fallback.index);
        r2.setEnd(node, fallback.index + fallback.segment.length);
        return r2;
      }
    }
    // Fallback: walk \w characters
    var left = idx, right = idx;
    while (left > 0 && /[A-Za-z0-9_À-ɏ]/.test(text[left-1])) left--;
    while (right < text.length && /[A-Za-z0-9_À-ɏ]/.test(text[right])) right++;
    if (left === right) return buildLetterRange(node, idx);
    var r3 = document.createRange();
    r3.setStart(node, left);
    r3.setEnd(node, right);
    return r3;
  }

  function buildBlockRange(node, idx) {
    var text = node.textContent;
    if (!text || text.length === 0) return null;
    // Stop characters: whitespace, brackets, operators, punctuation that
    // is NEVER part of a numeric literal. Comma and dot are special-cased
    // below so that 10,000.00 / 10.000,00 stay glued together.
    // The STOP set is intentionally MINIMAL: only whitespace, brackets,
    // and quote marks. Most other punctuation (.,/:;-+=*%@#&|^~!?$\)
    // routinely appears mid-token in real-world text and would split
    // every example below if listed here:
    //   - dates / times:   2026-05-04, 14:30:00, 5/4/2026, 04.05.2026
    //   - URLs / emails:   jane.doe@example.com, https://x.io/path
    //   - IDs / tickers:   IT12345678901, BRK.A, 123-45-6789
    //   - money / pct:     $100, $1.5M, 5%, 5.5%
    //   - law citations:   D.Lgs., § 823 BGB
    // The boundary still always stops at the next space / bracket /
    // quote, so multi-word names like "Apple Inc." still split on the
    // space (the user can multi-select or wait for depth=4 in phase 3).
    var STOP = /[\s\u00a0(){}\[\]<>"`'«»‹›‚„“”‘’‛‟]/;
    function isDigit(c) { return c !== undefined && c >= '0' && c <= '9'; }
    function isSep(c)   { return c === ',' || c === '.'; }

    var left = idx;
    while (left > 0) {
      var c = text[left - 1];
      if (STOP.test(c)) break;
      if (isSep(c)) {
        var prev = text[left - 2], next = text[left];
        if (!(isDigit(prev) && isDigit(next))) break;
      }
      left--;
    }
    var right = idx;
    while (right < text.length) {
      var c2 = text[right];
      if (STOP.test(c2)) break;
      if (isSep(c2)) {
        var prev2 = text[right - 1], next2 = text[right + 1];
        if (!(isDigit(prev2) && isDigit(next2))) break;
      }
      right++;
    }
    if (left === right) return buildLetterRange(node, idx);
    var r = document.createRange();
    r.setStart(node, left);
    r.setEnd(node, right);
    return r;
  }

  function paintTextSelection(range, depth, hostEl) {
    // Capture the range's anchor BEFORE surroundContents (the call splits
    // text nodes and reparents them, so the post-call range is no longer
    // anchored to the same DOM context). paragraphFromNode walks up from
    // the start container, which IS the actual text node we're selecting,
    // not the click event's target. The click target may be a wrapping
    // span from a prior chain or some other parent — always less reliable
    // than the range start for paragraph attribution.
    var anchor = range.startContainer;
    var paraEl = paragraphFromNode(anchor)
              || (hostEl && hostEl.closest ? hostEl.closest('[data-ve-pnum]') : null);
    var span = document.createElement('span');
    span.className = 've-text-sel';
    var entryId = 'text:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
    span.setAttribute('data-ve-text-sel', entryId);
    try {
      range.surroundContents(span);
    } catch (e) {
      return null; // range crosses element boundaries — give up silently
    }
    var text = span.textContent || '';
    var pnum = paraEl && paraEl.getAttribute ? paraEl.getAttribute('data-ve-pnum') : null;
    var paraText = paraEl ? (paraEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240) : null;
    veSelection.push({
      kind: 'text',
      entryId: entryId,
      text: text,
      depth: depth,
      paragraphId: pnum,
      paragraphText: paraText
    });
    updateSubmitButtonsState();
    return entryId;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Phase 3 — block-level text selection (depths 4-7).
  //
  // Depths 1-3 wrap a sub-paragraph fragment in a <span> via
  // surroundContents. Depths 4+ span across paragraph (or larger)
  // boundaries, so surroundContents would throw — instead we mark the
  // affected ELEMENTS with [data-ve-text-sel-block="<entryId>"] and
  // paint via CSS. Removal walks the DOM for matching elements.
  //
  // Scope by paragraph-numbering hierarchy (the existing numberProse()
  // assigns data-ve-pnum like "1.2.1"):
  //   depth 4 = paragraph     (single [data-ve-pnum] element)
  //   depth 5 = section       (chop one segment: "1.2.1" → "1.2",
  //                            select all elements with pnum "1.2"
  //                            or starting with "1.2.")
  //   depth 6 = chapter       (keep first segment: "1.2.1" → "1",
  //                            select all elements with pnum "1"
  //                            or starting with "1.")
  //   depth 7 = ALL prose     (every [data-ve-pnum] in the page)
  // ─────────────────────────────────────────────────────────────────────

  function pnumScope(currentPnum, depth) {
    if (!currentPnum) return null;
    if (depth === 4) return currentPnum;
    var parts = currentPnum.split('.');
    if (depth === 5) parts.pop();
    else if (depth === 6) parts = [parts[0]];
    return parts.join('.');
  }

  function elementsInPnumScope(scope) {
    if (!scope) return [];
    var els = document.querySelectorAll('[data-ve-prose] [data-ve-pnum]');
    var matches = [];
    var prefix = scope + '.';
    for (var i = 0; i < els.length; i++) {
      var p = els[i].getAttribute('data-ve-pnum');
      if (p === scope || p.indexOf(prefix) === 0) matches.push(els[i]);
    }
    return matches;
  }

  function paintBlockSelection(elements, depth) {
    if (!elements || elements.length === 0) return null;
    var entryId = 'text:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
    for (var i = 0; i < elements.length; i++) {
      elements[i].setAttribute('data-ve-text-sel-block', entryId);
    }
    var combined = '';
    for (var j = 0; j < elements.length; j++) {
      combined += (elements[j].textContent || '') + ' ';
      if (combined.length > 8000) break; // hard cap on collected text
    }
    combined = combined.replace(/\s+/g, ' ').trim();
    var firstPara = elements[0];
    var pnum = firstPara && firstPara.getAttribute ? firstPara.getAttribute('data-ve-pnum') : null;
    veSelection.push({
      kind: 'text',
      entryId: entryId,
      text: combined.slice(0, 5000),
      depth: depth,
      paragraphId: pnum,
      paragraphText: combined.slice(0, 240)
    });
    updateSubmitButtonsState();
    return entryId;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Phase 3 — math sub-formula selection (depths 1-3 inside .ve-math).
  //
  // KaTeX renders LaTeX into nested <span> trees with predictable class
  // names. The smallest visible atoms carry one of: .mord (ordinary
  // letter/digit), .mbin (binary op), .mrel (relation), .mop (large
  // operator), .mopen / .mclose (delimiters), .mpunct (punctuation),
  // .minner (inner). Group containers carry .mfrac, .msupsub, .minner,
  // or are themselves nested .mord wrappers.
  //
  //   depth 1 = smallest atom under the click
  //   depth 2 = enclosing group container (parent atom/group)
  //   depth 3 = the whole .ve-math element (single formula)
  //
  // Depths 4-7 fall through to the prose block path — the math click
  // is treated as a click on its containing [data-ve-pnum] paragraph.
  // ─────────────────────────────────────────────────────────────────────

  var MATH_ATOM_SELECTOR = '.mord,.mbin,.mrel,.mop,.mopen,.mclose,.mpunct,.minner,.mfrac,.msupsub';

  function mathAtomFromPoint(x, y, mathEl) {
    if (!document.elementsFromPoint) return null;
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (!mathEl.contains(el)) continue;
      if (el.matches && el.matches(MATH_ATOM_SELECTOR)) return el;
    }
    return null;
  }

  function mathGroupFromAtom(atom, mathEl) {
    if (!atom) return null;
    var p = atom.parentElement;
    while (p && p !== mathEl) {
      if (p.matches && p.matches(MATH_ATOM_SELECTOR)) return p;
      p = p.parentElement;
    }
    return null;
  }

  function paintMathSelection(mathEl, x, y, depth) {
    if (!mathEl) return null;
    var painted = null;
    if (depth === 1) {
      painted = mathAtomFromPoint(x, y, mathEl) || mathEl;
    } else if (depth === 2) {
      var atom = mathAtomFromPoint(x, y, mathEl);
      painted = mathGroupFromAtom(atom, mathEl) || atom || mathEl;
    } else {
      painted = mathEl;
    }
    var entryId = 'math:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
    painted.setAttribute('data-ve-math-sel', entryId);
    var src = mathEl.getAttribute('data-ve-math-source') || '';
    var paraEl = mathEl.closest ? mathEl.closest('[data-ve-pnum]') : null;
    var pnum = paraEl && paraEl.getAttribute ? paraEl.getAttribute('data-ve-pnum') : null;
    var text = (painted.textContent || '').replace(/\s+/g, ' ').trim();
    veSelection.push({
      kind: 'math',
      entryId: entryId,
      depth: depth,
      text: text.slice(0, 240),
      formulaLatex: src,
      paragraphId: pnum,
      paragraphText: paraEl ? (paraEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240) : null
    });
    updateSubmitButtonsState();
    return entryId;
  }

  function removeMathSelection(entryId) {
    var el = document.querySelector('[data-ve-math-sel="' + entryId + '"]');
    if (el) el.removeAttribute('data-ve-math-sel');
    for (var i = 0; i < veSelection.length; i++) {
      if (veSelection[i].entryId === entryId) {
        veSelection.splice(i, 1);
        break;
      }
    }
    updateSubmitButtonsState();
  }

  // Dispatch helper used by the chain-bump code: an entryId starting with
  // "math:" is a sub-formula entry, otherwise it's a text entry. This way
  // the click handler doesn't have to remember which painter ran last.
  function removeChainSelection(entryId) {
    if (!entryId) return;
    if (entryId.indexOf('math:') === 0) removeMathSelection(entryId);
    else removeTextSelection(entryId);
  }

  function removeTextSelection(entryId) {
    // Inline span entry (depths 1-3): unwrap.
    var span = document.querySelector('[data-ve-text-sel="' + entryId + '"]');
    if (span && span.parentNode) {
      var parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      if (parent.normalize) parent.normalize();
    }
    // Block-attribute entry (depths 4-7): clear the marker on every
    // element that was painted under this entryId.
    var blocks = document.querySelectorAll('[data-ve-text-sel-block="' + entryId + '"]');
    for (var b = 0; b < blocks.length; b++) {
      blocks[b].removeAttribute('data-ve-text-sel-block');
    }
    for (var i = 0; i < veSelection.length; i++) {
      if (veSelection[i].entryId === entryId) {
        veSelection.splice(i, 1);
        break;
      }
    }
    updateSubmitButtonsState();
  }

  function clearAllTextSelections() {
    var spans = document.querySelectorAll('[data-ve-text-sel]');
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      var parent = s.parentNode;
      if (!parent) continue;
      while (s.firstChild) parent.insertBefore(s.firstChild, s);
      parent.removeChild(s);
      if (parent.normalize) parent.normalize();
    }
    var blocks = document.querySelectorAll('[data-ve-text-sel-block]');
    for (var k = 0; k < blocks.length; k++) {
      blocks[k].removeAttribute('data-ve-text-sel-block');
    }
    var maths = document.querySelectorAll('[data-ve-math-sel]');
    for (var m = 0; m < maths.length; m++) {
      maths[m].removeAttribute('data-ve-math-sel');
    }
    for (var j = veSelection.length - 1; j >= 0; j--) {
      var k2 = veSelection[j].kind;
      if (k2 === 'text' || k2 === 'math') veSelection.splice(j, 1);
    }
  }

  function handleProseClick(ev) {
    if (sending) return;
    if (ev.defaultPrevented) return;
    var target = ev.target;
    if (!target || !target.closest) return;
    // Math click inside prose container? Route to the math grammar.
    var inProse = target.closest('[data-ve-prose]');
    if (!inProse) return;
    var mathEl = target.closest('.ve-math, [data-ve-math]');
    var isProseClick = !mathEl && isInsideProseText(target);
    var isMathClick = !!mathEl;
    if (!isProseClick && !isMathClick) return;
    // If the user is mid-drag (window selection has range), let the
    // snippet popup own that gesture — multi-click only fires for clean
    // collapsed-selection clicks.
    var winSel = window.getSelection();
    if (winSel && !winSel.isCollapsed && winSel.toString().length > 0) return;
    var now = Date.now();
    var clickX = ev.clientX, clickY = ev.clientY;
    // Track the chain by SCREEN COORDINATES, not by text-node identity.
    // surroundContents() splits the original text node into 3 siblings,
    // so the textNode reference is invalidated after the first paint —
    // the second click would otherwise look like a completely new chain
    // and reset depth to 1. Coordinates are stable across DOM mutations
    // (layout doesn't shift for a 1px-padded inline span).
    var sameChain = lastClickChain
      && (now - lastClickChain.time) < CLICK_GRACE_MS
      && Math.abs(clickX - lastClickChain.x) <= CLICK_GRACE_PX
      && Math.abs(clickY - lastClickChain.y) <= CLICK_GRACE_PX;
    if (sameChain) {
      // Remove the previous depth's selection FIRST. For text it unwraps
      // the inline span (so the text node re-unifies before re-painting);
      // for math it clears the [data-ve-math-sel] attribute. The dispatch
      // is by entryId prefix — see removeChainSelection.
      if (lastClickChain.entryId) removeChainSelection(lastClickChain.entryId);
      lastClickChain.depth = Math.min(lastClickChain.depth + 1, 7);
    } else {
      lastClickChain = {x: clickX, y: clickY, depth: 1, entryId: null, time: now};
    }
    var entryId = null;
    if (isMathClick) {
      // Math grammar (depths 1-3 = atom/group/formula; depths 4-7 fall
      // through to the prose block path on the surrounding paragraph).
      if (lastClickChain.depth <= 3) {
        entryId = paintMathSelection(mathEl, clickX, clickY, lastClickChain.depth);
      } else {
        var mathPara = mathEl.closest('[data-ve-pnum]');
        var mathPnum = mathPara && mathPara.getAttribute ? mathPara.getAttribute('data-ve-pnum') : null;
        if (mathPnum) {
          var melements;
          if (lastClickChain.depth === 7) {
            melements = Array.from(document.querySelectorAll('[data-ve-prose] [data-ve-pnum]'));
          } else {
            var mscope = pnumScope(mathPnum, lastClickChain.depth);
            melements = elementsInPnumScope(mscope);
          }
          entryId = paintBlockSelection(melements, lastClickChain.depth);
        } else {
          // No numbered paragraph around the formula — degrade to depth 3
          // (whole formula).
          entryId = paintMathSelection(mathEl, clickX, clickY, 3);
          if (entryId) lastClickChain.depth = 3;
        }
      }
    } else {
      // Prose text grammar (existing depths 1-3 inline + 4-7 block).
      // Re-resolve caret AFTER any unwrap — the text node may have changed.
      var pos = caretInfoAt(clickX, clickY);
      if (!pos) {
        lastClickChain = null;
        return;
      }
      var textNode = pos.node;
      var idx = pos.offset;
      var range = null;
      if (lastClickChain.depth <= 3) {
        if (lastClickChain.depth === 1)      range = buildLetterRange(textNode, idx);
        else if (lastClickChain.depth === 2) range = buildWordRange(textNode, idx);
        else                                  range = buildBlockRange(textNode, idx);
        if (!range) return;
        entryId = paintTextSelection(range, lastClickChain.depth, target);
      } else {
        var paraEl = paragraphFromNode(textNode);
        var pnum = paraEl && paraEl.getAttribute ? paraEl.getAttribute('data-ve-pnum') : null;
        if (!pnum) {
          range = buildBlockRange(textNode, idx);
          if (range) entryId = paintTextSelection(range, 3, target);
          if (entryId) lastClickChain.depth = 3;
        } else {
          var elements;
          if (lastClickChain.depth === 7) {
            elements = Array.from(document.querySelectorAll('[data-ve-prose] [data-ve-pnum]'));
          } else {
            var scope = pnumScope(pnum, lastClickChain.depth);
            elements = elementsInPnumScope(scope);
          }
          entryId = paintBlockSelection(elements, lastClickChain.depth);
        }
      }
    }
    if (entryId) {
      lastClickChain.entryId = entryId;
      lastClickChain.time = Date.now();
    }
  }

  function setupMultiClickSelection() {
    document.addEventListener('click', handleProseClick, false);
  }

  function setupSnippetSelection() {
    document.addEventListener('mouseup', function (ev) {
      // Defer so the selection state has settled.
      if (ev.target.closest('[data-ve-snippet-popup], [data-ve-overlay]')) return;
      setTimeout(showSnippetPopup, 30);
    });
    document.addEventListener('keyup', function (ev) {
      if (ev.shiftKey || ev.key === 'Shift') return;
      // Selection via keyboard nav: refresh popup on key release.
      setTimeout(showSnippetPopup, 30);
    });
    document.addEventListener('mousedown', function (ev) {
      if (snippetPopup && !ev.target.closest('[data-ve-snippet-popup]')) {
        clearSnippetPopup();
      }
    });
    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) clearSnippetPopup();
    });
    window.addEventListener('scroll', clearSnippetPopup, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectStyles();
      initAllMath();      // KaTeX, lazy
      initAllTikz();      // TikZJax, lazy
      initAllGraphs();    // viz.js (Graphviz), lazy
      initAllProse();
      enhanceFocus();
      initAllTableForms();
      setupSnippetSelection();
      setupMultiClickSelection();
    });
  } else {
    injectStyles();
    initAllMath();
    initAllTikz();
    initAllGraphs();
    initAllProse();
    enhanceFocus();
    initAllTableForms();
    setupSnippetSelection();
  }
})();
