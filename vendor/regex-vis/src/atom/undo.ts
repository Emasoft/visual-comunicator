import { atom } from 'jotai'
import { astAtom, redoStackAtom, undoStackAtom } from './atoms'
import { clearSelectedAtom } from './select'

export const undoAtom = atom(null, (get, set) => {
  const stack = get(undoStackAtom)
  if (stack.length > 0) {
    const ast = stack[stack.length - 1]
    set(undoStackAtom, stack.slice(0, -1))
    set(redoStackAtom, [...get(redoStackAtom), get(astAtom)])
    set(clearSelectedAtom)
    set(astAtom, ast)
  }
})

export const redoAtom = atom(null, (get, set) => {
  const stack = get(redoStackAtom)
  if (stack.length > 0) {
    const ast = stack[stack.length - 1]
    set(redoStackAtom, stack.slice(0, -1))
    set(undoStackAtom, [...get(undoStackAtom), get(astAtom)])
    set(clearSelectedAtom)
    set(astAtom, ast)
  }
})
