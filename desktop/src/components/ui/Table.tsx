import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ReactNode } from 'react'

interface TableProps {
  caption?: string
  footer?: ReactNode
  children: ReactNode
}

export function Table({ caption, footer, children }: TableProps) {
  return (
    <div className="glass border-card-edge rounded-card overflow-hidden border shadow-card">
      <div className="overflow-x-auto">
        <table className="text-body w-full border-collapse text-left">
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
      {footer && <div className="border-divider border-t">{footer}</div>}
    </div>
  )
}

const HEADER_CELL =
  'text-caption text-muted-foreground border-divider border-b px-6 py-4 font-semibold whitespace-nowrap'

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`${HEADER_CELL} ${className}`}>
      {children}
    </th>
  )
}

export type SortDirection = 'ascending' | 'descending'

interface SortableThProps {
  label: string
  buttonLabel: string
  direction: SortDirection | null
  onSort: () => void
  className?: string
}

export function SortableTh({ label, buttonLabel, direction, onSort, className = '' }: SortableThProps) {
  const Icon = direction === null ? ArrowUpDown : direction === 'descending' ? ArrowDown : ArrowUp
  return (
    <th scope="col" aria-sort={direction ?? undefined} className={`${HEADER_CELL} ${className}`}>
      <button
        type="button"
        aria-label={buttonLabel}
        onClick={onSort}
        className="hover:text-foreground inline-flex items-center gap-1 rounded-full"
      >
        {label}
        <Icon
          className={`size-3.5 ${direction === null ? 'opacity-40' : 'text-foreground'}`}
          aria-hidden="true"
        />
      </button>
    </th>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <td className={`border-divider border-b px-6 py-4 align-middle [tr:last-child>&]:border-b-0 ${className}`}>
      {children}
    </td>
  )
}

export function TableMessage({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12">
        {children}
      </td>
    </tr>
  )
}
