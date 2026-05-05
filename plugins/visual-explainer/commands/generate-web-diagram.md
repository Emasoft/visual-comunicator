---
description: Generate a beautiful standalone HTML diagram and open it in the browser
---
Load the visual-explainer skill, then generate an HTML diagram for: $@

Follow the visual-explainer skill workflow. Read the reference template and CSS patterns before generating. Pick a distinctive aesthetic that fits the content — vary fonts, palette, and layout style from previous diagrams.

If `surf` CLI is available (`which surf`), consider generating an AI illustration via `surf gemini --generate-image` when an image would genuinely enhance the page — a hero banner, conceptual illustration, or educational diagram that Mermaid can't express. Match the image style to the page's palette. Embed as base64 data URI. See css-patterns.md "Generated Images" for container styles. Skip images when the topic is purely structural or data-driven.

Mark every meaningful element selectable with `data-ve-id` / `data-ve-type` / `data-ve-label`, embed `<script src="ve-runtime.js"></script>` at end of body, and add `click X call veSelectMermaid("X","Label")` directives plus `securityLevel: 'loose'` to any Mermaid diagrams. See `./references/interactive-selection.md` for the full pattern.

Write to `~/.agent/diagrams/`, open it via the interactive selection runner (`python3 <skill-dir>/scripts/ve-select.py ~/.agent/diagrams/<file>.html`), and respond to whatever the user clicks per the SKILL.md "Required follow-up after a selection" template.
