import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { inputClass } from './styles'

const DEBOUNCE_MS = 300

interface SearchInputProps {
  value: string
  label: string
  onChange: (value: string) => void
}

export function SearchInput({ value, label, onChange }: SearchInputProps) {
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
    <label className="relative block w-full max-w-xs">
      <span className="sr-only">{label}</span>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        type="search"
        value={draft}
        placeholder={label}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        className={`${inputClass} pl-9`}
      />
    </label>
  )
}
