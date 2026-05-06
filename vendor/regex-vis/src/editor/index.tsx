import { useAtomValue, useSetAtom } from 'jotai'
import { useEventListener } from 'usehooks-ts'
import clsx from 'clsx'
import EditTab from './edit-tab'
import {
  redoAtom,
  removeAtom,
  selectedIdsAtom,
  undoAtom,
} from '@/atom'
import { ScrollArea } from '@/components/ui/scroll-area'

// visual-explainer customisation: drop the upstream Legend / Edit / Test
// tab strip — agents are explaining one regex at a time and only the
// edit features are useful here. The Edit panel is always visible; when
// nothing is selected it shows a short placeholder, otherwise it
// renders the per-node-type editing controls (insert / group /
// quantifier / look-around / content). i18n is also stripped.

export type Tab = 'edit'
type Props = {
  defaultTab?: Tab
  collapsed: boolean
}
function Editor({ collapsed }: Props) {
  const selectedIds = useAtomValue(selectedIdsAtom)
  const remove = useSetAtom(removeAtom)
  const undo = useSetAtom(undoAtom)
  const redo = useSetAtom(redoAtom)

  useEventListener('keydown', (e: Event) => {
    const event = e as KeyboardEvent
    const tagName = (event.target as HTMLElement)?.tagName
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
      return
    }
    const { key } = event
    if (key === 'Backspace' || key === 'Delete') {
      e.preventDefault()
      return remove()
    }
    // Compare case-insensitively because `KeyboardEvent.key` reflects the
    // produced character: `'z'` for ⌘Z but `'Z'` for ⌘⇧Z (Shift case-shifts
    // the key value). The upstream check `key === 'z'` therefore never
    // matched the redo combo, so ⌘⇧Z silently did nothing.
    const metaKey = event.ctrlKey || event.metaKey
    const isZ = key === 'z' || key === 'Z'
    if (metaKey && event.shiftKey && isZ) {
      e.preventDefault()
      return redo()
    }
    if (metaKey && isZ) {
      e.preventDefault()
      return undo()
    }
  })

  const empty = selectedIds.length === 0

  return (
    <div
      className={clsx(
        've-regex-edit-panel flex flex-col py-4 border-l transition-[width]',
        collapsed ? 'w-[0px]' : 'w-[305px]',
      )}
    >
      <div className="px-4 mb-4 text-xs uppercase tracking-wider opacity-60 select-none">
        Edit
      </div>
      <ScrollArea className="flex-1">
        <div className="w-[305px] p-4 pt-0">
          {empty
            ? (
                <p className="text-sm opacity-70 leading-relaxed">
                  Click any node in the graph to edit it. Hold shift while
                  clicking to extend the selection. Backspace removes the
                  selected nodes; ⌘Z / ⌘⇧Z undo and redo.
                </p>
              )
            : <EditTab />}
        </div>
      </ScrollArea>
    </div>
  )
}

export default Editor
