import { ChevronsUpDown } from 'lucide-react'
import type { Ref, SelectHTMLAttributes } from 'react'
import { selectClass } from './styles'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>
}

export function Select({ className = '', ref, children, ...props }: SelectProps) {
  return (
    <span className="relative block">
      <select ref={ref} className={`${selectClass} ${className}`} {...props}>
        {children}
      </select>
      <ChevronsUpDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 size-3.5 -translate-y-1/2"
        aria-hidden="true"
      />
    </span>
  )
}
