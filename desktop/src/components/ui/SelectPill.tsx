import { ChevronsUpDown } from 'lucide-react'
import type { ReactNode, Ref, SelectHTMLAttributes } from 'react'
import { Popover } from './Popover'

export const PILL_FIELD_BASE =
  'border-control-border bg-control text-body relative inline-flex h-10 items-center gap-2 rounded-full border pl-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus'

export const PILL_FIELD = `${PILL_FIELD_BASE} pr-9`

interface SelectPillProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  children: ReactNode
  ref?: Ref<HTMLSelectElement>
}

export function SelectPill({ label, className = '', children, ...props }: SelectPillProps) {
  return (
    <label className={`${PILL_FIELD} ${className}`}>
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <select
        aria-label={label}
        className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent font-semibold outline-none"
        {...props}
      >
        {children}
      </select>
      <ChevronsUpDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2"
        aria-hidden="true"
      />
    </label>
  )
}

export interface MultiOption<T extends string> {
  value: T
  label: string
}

export interface MultiPreset<T extends string> {
  label: string
  values: readonly T[]
}

interface MultiSelectPillProps<T extends string> {
  label: string
  summary: string
  options: readonly MultiOption<T>[]
  value: readonly T[]
  onChange: (value: T[]) => void
  presets?: readonly MultiPreset<T>[]
}

export function MultiSelectPill<T extends string>({
  label,
  summary,
  options,
  value,
  onChange,
  presets = [],
}: MultiSelectPillProps<T>) {
  return (
    <Popover
      label={label}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={`${PILL_FIELD} cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
        >
          <span className="text-muted-foreground whitespace-nowrap">{label}</span>
          <span className="font-semibold whitespace-nowrap">{summary}</span>
          <ChevronsUpDown
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
        </button>
      )}
    >
      <div className="flex flex-col gap-3">
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const active =
                  preset.values.length === value.length && preset.values.every((item) => value.includes(item))
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onChange([...preset.values])
                    }}
                    className={[
                      'text-caption h-7 rounded-full border px-3 font-semibold',
                      active
                        ? 'bg-solid text-solid-foreground border-transparent'
                        : 'border-divider text-foreground hover:bg-surface-sunken',
                    ].join(' ')}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">
              {label}
            </legend>
            {options.map((option) => (
              <label key={option.value} className="text-body flex cursor-pointer items-center gap-2.5 font-medium">
                <input
                  type="checkbox"
                  className="accent-solid size-4 cursor-pointer"
                  checked={value.includes(option.value)}
                  onChange={(event) => {
                    onChange(
                      event.target.checked
                        ? [...value, option.value]
                        : value.filter((item) => item !== option.value),
                    )
                  }}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
      </div>
    </Popover>
  )
}
