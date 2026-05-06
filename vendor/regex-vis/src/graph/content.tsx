import React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { isPrimaryGraphAtom, selectNodeAtom, toggleSelectNodeAtom } from '@/atom'
import { GRAPH_NODE_BORDER_RADIUS } from '@/constants'

type Props = { id: string, selected: boolean } & React.ComponentProps<'rect'>

function Content({ id, selected, children, ...restProps }: Props) {
  const selectNode = useSetAtom(selectNodeAtom)
  const toggleSelectNode = useSetAtom(toggleSelectNodeAtom)
  const isPrimaryGraph = useAtomValue(isPrimaryGraphAtom)
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isPrimaryGraph) return
    if (e.shiftKey) {
      toggleSelectNode(id)
    } else {
      selectNode(id)
    }
  }
  return (
    <g onClick={handleClick}>
      <rect {...restProps}></rect>
      {selected && (
        <rect
          {...restProps}
          className="ve-regex-selected-fill"
          rx={GRAPH_NODE_BORDER_RADIUS}
          ry={GRAPH_NODE_BORDER_RADIUS}
        >
        </rect>
      )}
      {children}
    </g>
  )
}

Content.displayName = 'Content'
export default Content
