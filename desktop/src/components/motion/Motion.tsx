import { animate, motion, type Variants } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { SPRING } from './transitions'

const EASE = [0.22, 1, 0.36, 1] as const
const PAGE_SECONDS = 0.45
const PAGE_OFFSET = 24
const PAGE_SCALE = 0.98
const STAGGER_SECONDS = 0.08
const GROW_SECONDS = 0.7
const COUNT_SECONDS = 0.9
const ENTER_OFFSET = 16
const SOFT_BOUNCE = [0.34, 1.3, 0.64, 1] as const

const PARENT: Variants = { hidden: {}, show: { transition: { staggerChildren: STAGGER_SECONDS } } }
const ITEM: Variants = {
  hidden: { opacity: 0, y: ENTER_OFFSET },
  show: { opacity: 1, y: 0, transition: SPRING },
}

interface BoxProps {
  children: ReactNode
  className?: string
}

export function PageFade({ children, className }: BoxProps) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: PAGE_OFFSET, scale: PAGE_SCALE }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: PAGE_SECONDS, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className }: BoxProps) {
  const reduced = useReducedMotion()
  return (
    <motion.div className={className} variants={PARENT} initial={reduced ? false : 'hidden'} animate="show">
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: BoxProps) {
  return (
    <motion.div className={className} variants={ITEM}>
      {children}
    </motion.div>
  )
}

interface GrowProps {
  className?: string
  style?: React.CSSProperties
  delay?: number
  axis?: 'x' | 'y'
  children?: ReactNode
}

export function Grow({ className, style, delay = 0, axis = 'x', children }: GrowProps) {
  const reduced = useReducedMotion()
  const from = axis === 'x' ? { scaleX: 0 } : { scaleY: 0 }
  const to = axis === 'x' ? { scaleX: 1 } : { scaleY: 1 }
  return (
    <motion.span
      className={className}
      style={{ ...style, transformOrigin: axis === 'x' ? 'left center' : 'center bottom', display: 'block' }}
      initial={reduced ? false : from}
      animate={to}
      transition={{ duration: GROW_SECONDS, delay, ease: SOFT_BOUNCE }}
    >
      {children}
    </motion.span>
  )
}

export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  const previous = useRef(0)

  useEffect(() => {
    if (reduced) {
      previous.current = value
      return
    }
    const controls = animate(previous.current, value, {
      duration: COUNT_SECONDS,
      ease: EASE,
      onUpdate: (latest) => {
        previous.current = latest
        setShown(latest)
      },
    })
    return () => {
      controls.stop()
    }
  }, [value, reduced])

  return <>{format(reduced ? value : Math.round(shown))}</>
}
