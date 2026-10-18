import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PILL_FIELD_BASE } from './SelectPill'

const DEBOUNCE_MS = 300

interface SearchInputProps {
  value: string
  label: string
  onChange: (value: string) => void
  className?: string
}

export function SearchInput({ value, label, onChange, className = '' }: SearchInputProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => {
      onChange(draft)
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [draft, value, onChange])

  return (
    <label className={`${PILL_FIELD_BASE} pr-4 ${className}`}>
      <span className="sr-only">{label}</span>
      <Search className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={draft}
        placeholder={label}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        className="placeholder:text-subtle-foreground min-w-0 flex-1 bg-transparent font-medium outline-none"
      />
    </label>
  )
}
