import type { ReactNode } from 'react'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface overflow-x-auto rounded-xl border shadow-xs">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`text-muted-foreground bg-surface-muted border-b px-4 py-2.5 text-xs font-medium tracking-wide uppercase ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b px-4 py-3 align-middle ${className}`}>{children}</td>
}

export function TableMessage({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-muted-foreground px-4 py-10 text-center">
        {children}
      </td>
    </tr>
  )
}
