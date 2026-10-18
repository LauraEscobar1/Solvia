import { UserRound } from 'lucide-react'

const TONES = ['bg-avatar-1', 'bg-avatar-2', 'bg-avatar-3', 'bg-avatar-4', 'bg-avatar-5'] as const

const SIZES = {
  xs: 'size-6 text-micro',
  sm: 'size-7 text-micro',
  md: 'size-10 text-caption',
  lg: 'size-18 text-heading',
} as const

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : ''
  return `${first}${last}`.toLocaleUpperCase()
}

function avatarTone(key: string): (typeof TONES)[number] {
  let hash = 0
  for (const char of key) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return TONES[hash % TONES.length] ?? TONES[0]
}

interface AvatarProps {
  name: string
  id?: string
  size?: keyof typeof SIZES
  self?: boolean
  className?: string
}

export function Avatar({ name, id, size = 'sm', self = false, className = '' }: AvatarProps) {
  const tone = self ? 'bg-avatar-self' : avatarTone(id ?? name)
  return (
    <span
      aria-hidden="true"
      className={`text-avatar-foreground inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tone} ${SIZES[size]} ${className}`}
    >
      {initialsOf(name)}
    </span>
  )
}

export function EmptyAvatar({ size = 'sm' }: { size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden="true"
      className={`border-control-border text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-full border border-dashed ${SIZES[size]}`}
    >
      <UserRound className="size-3.5" />
    </span>
  )
}
