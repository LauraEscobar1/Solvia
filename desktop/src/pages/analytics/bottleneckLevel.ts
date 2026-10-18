import type { BottleneckCell } from '@/lib/api/types'

export const SLOW_MULTIPLE = 1.3

export type BottleneckLevel = 'normal' | 'slow' | 'bottleneck'

export function cellMultiple(cell: BottleneckCell): number | null {
  if (cell.avg_hours === null || cell.median_avg_hours === null || cell.median_avg_hours <= 0) return null
  return cell.avg_hours / cell.median_avg_hours
}

export function cellLevel(cell: BottleneckCell): BottleneckLevel {
  if (cell.is_bottleneck) return 'bottleneck'
  const multiple = cellMultiple(cell)
  return multiple !== null && multiple >= SLOW_MULTIPLE ? 'slow' : 'normal'
}
