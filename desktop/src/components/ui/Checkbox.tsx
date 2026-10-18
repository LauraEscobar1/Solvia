import type { InputHTMLAttributes, ReactNode, Ref } from 'react'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Checkbox({ label, className = '', ...props }: CheckboxProps) {
  return (
    <label className={`text-body inline-flex cursor-pointer items-center gap-2.5 font-medium ${className}`}>
      <input
        type="checkbox"
        className="accent-solid rounded-check size-4 shrink-0 cursor-pointer"
        {...props}
      />
      {label}
    </label>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  id?: string
}

export function Switch({ checked, onChange, label, disabled = false, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        onChange(!checked)
      }}
      className={[
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-accent border-transparent' : 'bg-surface-sunken border-control-border',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'size-5 rounded-full shadow-card transition-transform',
          checked ? 'bg-ink translate-x-6' : 'bg-control translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
