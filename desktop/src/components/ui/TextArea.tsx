import { type Ref, type TextareaHTMLAttributes, useCallback, useLayoutEffect, useRef } from 'react'
import { textareaClass } from './styles'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function TextArea({ autoGrow = false, className = '', onInput, ref, ...props }: TextAreaProps) {
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
      className={`${textareaClass} ${autoGrow ? 'resize-none overflow-hidden' : ''} ${className}`}
      {...props}
    />
  )
}
