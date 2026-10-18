export const CONTROL_BASE =
  'border-control-border bg-control text-body border text-foreground placeholder:text-subtle-foreground aria-invalid:border-danger-text disabled:cursor-not-allowed disabled:opacity-55'

export const inputClass = `${CONTROL_BASE} h-11 w-full rounded-full px-4`

export const compactInputClass = `${CONTROL_BASE} h-10 w-full rounded-full px-3`

export const numberInputClass = `${CONTROL_BASE} h-10 w-20 rounded-full px-3 tabular-nums`

export const textareaClass = `${CONTROL_BASE} rounded-inner min-h-24 w-full px-4 py-3 leading-relaxed`

export const selectClass = `${CONTROL_BASE} h-11 w-full cursor-pointer appearance-none rounded-full pr-10 pl-4`
