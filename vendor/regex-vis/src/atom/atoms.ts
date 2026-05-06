import { atom } from 'jotai'
import { atomWithImmer } from 'jotai-immer'
import type { AST } from '@/parser'
import type { NodeSize } from '@/modules/graph/measure'

// Per-mount undo / redo history. The plugin's runtime mounts a fresh
// Jotai store for every `.ve-regex` block (`ve-regex-entry.tsx` →
// `createStore()` per render call), so making these atoms instead of
// module-level arrays keeps each graph's history isolated. With the
// previous module-level arrays, pressing Cmd+Z on one graph would
// pop entries pushed by a sibling graph and corrupt its AST.
export const undoStackAtom = atom<AST.Regex[]>([])
export const redoStackAtom = atom<AST.Regex[]>([])
export const nodesBoxMap: Map<
  string,
  { x1: number, y1: number, x2: number, y2: number }[]
> = new Map()

export const astAtom = atomWithImmer<AST.Regex>({
  id: '',
  type: 'regex',
  body: [],
  flags: [],
  literal: false,
  escapeBackslash: false,
})

export const selectedIdsAtom = atom<string[]>([])
export const groupNamesAtom = atom<string[]>([])

export const sizeMapAtom = atom<Map<AST.Node | AST.Node[], NodeSize>>(new Map())
export const isPrimaryGraphAtom = atom<boolean>(true)
