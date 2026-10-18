import type { ReactNode } from 'react'

export function RiskMeter({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      className="bg-risk-track relative h-2 overflow-hidden rounded-full"
    >
      <div
        className="from-risk-start via-risk-mid to-risk-end absolute inset-0 bg-linear-to-r"
        style={{ clipPath: `inset(0 ${100 - clamped}% 0 0 round 9999px)` }}
      />
    </div>
  )
}

export interface StageSegment {
  key: string
  label: string
  count: number
  colorClass: string
}

export function StageBar({
  segments,
  label,
  legendItem,
}: {
  segments: StageSegment[]
  label: string
  legendItem: (segment: StageSegment) => ReactNode
}) {
  const visible = segments.filter((segment) => segment.count > 0)
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex h-3 gap-1">
        {visible.length === 0 ? (
          <span className="bg-surface-sunken h-full flex-1 rounded-full" />
        ) : (
          visible.map((segment) => (
            <span
              key={segment.key}
              className={`h-full min-w-3 rounded-full ${segment.colorClass}`}
              style={{ flexGrow: segment.count }}
            />
          ))
        )}
      </div>
      <ul aria-label={label} className="text-caption text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 font-semibold">
        {segments.map((segment) => (
          <li key={segment.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 rounded-sm ${segment.colorClass}`} />
            {legendItem(segment)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export type StepState = 'done' | 'current' | 'pending' | 'cancelled'

export interface Step {
  key: string
  eyebrow: string
  label: string
  detail: string
  state: StepState
}

const STEP_CLASSES: Record<StepState, string> = {
  done: 'bg-surface-raised text-foreground shadow-card',
  current: 'bg-solid text-solid-foreground',
  pending: 'border-divider text-muted-foreground border',
  cancelled: 'bg-danger-soft text-danger-soft-foreground',
}

export function Stepper({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {steps.map((step) => (
        <li
          key={step.key}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={`rounded-inner flex flex-col gap-0.5 px-4 py-4 ${STEP_CLASSES[step.state]}`}
        >
          <span className="text-caption font-semibold opacity-80">{step.eyebrow}</span>
          <span className="text-heading">{step.label}</span>
          <span className="text-caption font-medium">{step.detail}</span>
        </li>
      ))}
    </ol>
  )
}
