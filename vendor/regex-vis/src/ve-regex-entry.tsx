// VeRegex entry point — exposes a vanilla render() function that the
// visual-explainer runtime can call to mount the regex graph + edit
// panel inside any container element.
//
// The pattern mirrors how ve-runtime.js lazy-loads KaTeX / viz.js /
// Mermaid / TikZJax: at first sight of a `.ve-regex[data-regex]`
// element on the page, the runtime fetches `ve-regex.umd.js` +
// `ve-regex.css` and calls `window.VeRegex.render(el, options)`.
//
// Vendored from Bowen7/regex-vis (MIT, see LICENSE.upstream). The
// parser, AST modifiers, graph layout, and edit-panel features are
// kept intact — only the chrome (URL params, toast, sentry, i18n)
// and the styling layer (Tailwind → our CSS vars) are stripped.

import React, { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore, useAtom, useAtomValue, useSetAtom } from 'jotai'
import Graph from './graph'
import Editor from './editor'
import { astAtom, clearSelectedAtom } from './atom'
import { parse, gen } from './parser'
import type { AST } from './parser'

export type RenderOptions = {
  regex: string
  defaultTab?: 'legend' | 'edit' | 'test'
  onChange?: (next: { regex: string; ast: AST.Regex }) => void
}

// One Jotai store per mount, so multiple `.ve-regex` blocks on the
// same page don't collide on the AST atom.
function App({ regex: initialRegex, defaultTab = 'legend', onChange }: RenderOptions) {
  const [regex, setRegex] = useState(initialRegex)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [ast, setAst] = useAtom(astAtom)
  const clearSelected = useSetAtom(clearSelectedAtom)

  // Parse incoming regex string -> AST. The Home component in the
  // upstream source does this in two effects (parse + regenerate);
  // we collapse the parse half and emit `onChange` whenever the
  // generated regex string differs from the input (i.e. an edit
  // committed via the editor panel mutated the AST).
  useEffect(() => {
    const parsed = parse(regex)
    clearSelected()
    if (parsed.type === 'regex') {
      setErrorMsg(null)
      setAst(parsed)
    } else {
      setErrorMsg(parsed.message)
    }
  }, [regex, setAst, clearSelected])

  // Whenever the AST changes, regenerate the regex string and emit
  // an onChange callback if it differs.
  useEffect(() => {
    if (!ast || ast.body.length === 0) return
    const generated = gen(ast)
    if (generated !== regex) {
      setRegex(generated)
      onChange?.({ regex: generated, ast: ast as AST.Regex })
    }
  }, [ast])

  return (
    <div className="ve-regex-app">
      <Graph regex={regex} ast={ast as AST.Regex} errorMsg={errorMsg} />
      <Editor defaultTab={defaultTab} collapsed={false} />
    </div>
  )
}

// Public render API — vanilla JS friendly, no React types leak out.
export function render(container: HTMLElement, options: RenderOptions): { unmount: () => void } {
  const store = createStore()
  const root: Root = createRoot(container)
  root.render(
    <Provider store={store}>
      <App {...options} />
    </Provider>,
  )
  return {
    unmount: () => root.unmount(),
  }
}

// Single named export only. Vite's UMD output exposes the export
// object as `window.VeRegex`, so the canonical call site from
// ve-runtime.js is `window.VeRegex.render(el, options)`. We
// intentionally omit a `default` export — when both named and default
// exports coexist in a UMD lib build, Vite emits the namespace such
// that callers must write `VeRegex.default.render(...)`, which would
// silently break ve-runtime.js. Named-only keeps the API flat.
