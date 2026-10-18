import { type Ref, type TextareaHTMLAttributes, useCallback, useLayoutEffect, useRef } from 'react'
import { textareaClass } from './styles'

const BARE =
  'text-body w-full bg-transparent text-foreground outline-none placeholder:text-subtle-foreground disabled:cursor-not-allowed disabled:opacity-55'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean
  bare?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function TextArea({ autoGrow = false, bare = false, className = '', onInput, ref, ...props }: TextAreaProps) {
  const local = useRef<HTMLTextAreaElement | null>(null)

  const resize = useCallback(() => {
    const element = local.current
    if (!autoGrow || !element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [autoGrow])

  useLayoutEffect(resize)

  return (
    <textarea
      ref={(element) => {
        local.current = element
        assignRef(ref, element)
      }}
      onInput={(event) => {
        resize()
        onInput?.(event)
      }}
      className={`${bare ? BARE : textareaClass} ${autoGrow ? 'resize-none overflow-y-auto' : ''} ${className}`}
      {...props}
    />
  )
}
