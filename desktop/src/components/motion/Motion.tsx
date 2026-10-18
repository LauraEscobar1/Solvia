import { motion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'
import { useReducedMotion } from '@/lib/useReducedMotion'

const EASE = [0.22, 1, 0.36, 1] as const
const FADE_SECONDS = 0.2
const ITEM_SECONDS = 0.26
const STAGGER_SECONDS = 0.06
const GROW_SECONDS = 0.3
const ENTER_OFFSET = 10

const PARENT: Variants = { hidden: {}, show: { transition: { staggerChildren: STAGGER_SECONDS } } }
const ITEM: Variants = {
  hidden: { opacity: 0, y: ENTER_OFFSET },
  show: { opacity: 1, y: 0, transition: { duration: ITEM_SECONDS, ease: EASE } },
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
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: FADE_SECONDS, ease: 'easeOut' }}
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
      transition={{ duration: GROW_SECONDS, delay, ease: EASE }}
    >
      {children}
    </motion.span>
  )
}
