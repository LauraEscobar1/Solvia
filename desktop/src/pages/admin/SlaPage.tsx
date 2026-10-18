import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/styles'
import { Table, TableMessage, Td, Th } from '@/components/ui/Table'
import { useSaveSlaPolicies, useSlaPolicies } from '@/lib/api/admin'
import { useTranslateError } from '@/lib/api/errors'
import { REQUEST_PRIORITIES, SLA_STAGES, type SlaPolicy } from '@/lib/api/types'

const MAX_HOURS = 24 * 365

const hoursSchema = z
  .number({ error: 'positiveInteger' })
  .int('positiveInteger')
  .min(1, 'positiveInteger')
  .max(MAX_HOURS, 'positiveInteger')

const slaSchema = z.object({
  policies: z.array(
    z
      .object({
        priority: z.enum(REQUEST_PRIORITIES),
        status: z.enum(SLA_STAGES),
        max_hours: hoursSchema,
        inactivity_hours: hoursSchema,
      })
      .refine((policy) => policy.inactivity_hours <= policy.max_hours, {
        error: 'inactivityExceedsMax',
        path: ['inactivity_hours'],
      }),
  ),
})

type SlaValues = z.infer<typeof slaSchema>

const MATRIX = REQUEST_PRIORITIES.flatMap((priority) =>
  SLA_STAGES.map((status) => ({ priority, status })),
)

function toFormValues(policies: SlaPolicy[]): SlaValues {
  return {
    policies: MATRIX.map(({ priority, status }) => {
      const policy = policies.find((p) => p.priority === priority && p.status === status)
      return {
        priority,
        status,
        max_hours: policy?.max_hours ?? Number.NaN,
        inactivity_hours: policy?.inactivity_hours ?? Number.NaN,
      }
    }),
  }
}

export function SlaPage() {
  const { t } = useTranslation(['admin', 'common', 'validation'])
  const translateError = useTranslateError()
  const policies = useSlaPolicies()
  const save = useSaveSlaPolicies()
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SlaValues>({
    resolver: zodResolver(slaSchema),
    defaultValues: toFormValues([]),
  })

  useEffect(() => {
    if (policies.data) reset(toFormValues(policies.data))
  }, [policies.data, reset])

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false)
    await save.mutateAsync(values.policies)
    setSaved(true)
  })

  const fieldError = (index: number, field: 'max_hours' | 'inactivity_hours') => {
    const message = errors.policies?.[index]?.[field]?.message
    return message ? t(message, { ns: 'validation', defaultValue: t('validation:invalid') }) : null
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t('sla.description')}</p>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
        className="flex flex-col gap-4"
      >
        <Table>
          <thead>
            <tr>
              <Th>{t('sla.priority')}</Th>
              {SLA_STAGES.map((stage) => (
                <Th key={stage}>{t(`sla.stages.${stage}`)}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {policies.isPending && <TableMessage colSpan={4}>{t('table.loading')}</TableMessage>}
            {policies.isError && (
              <TableMessage colSpan={4}>{translateError(policies.error)}</TableMessage>
            )}
            {policies.data &&
              REQUEST_PRIORITIES.map((priority, row) => (
                <tr key={priority}>
                  <Td className="font-medium">{t(`sla.priorities.${priority}`)}</Td>
                  {SLA_STAGES.map((stage, column) => {
                    const index = row * SLA_STAGES.length + column
                    const cell = `${t(`sla.priorities.${priority}`)} · ${t(`sla.stages.${stage}`)}`
                    const errorMessage =
                      fieldError(index, 'max_hours') ?? fieldError(index, 'inactivity_hours')
                    return (
                      <Td key={stage}>
                        <div className="flex gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">{t('sla.maxHours')}</span>
                            <input
                              type="number"
                              min={1}
                              aria-label={`${t('sla.maxHours')} · ${cell}`}
                              aria-invalid={Boolean(fieldError(index, 'max_hours'))}
                              className={`${inputClass} w-20`}
                              {...register(`policies.${index}.max_hours`, { valueAsNumber: true })}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              {t('sla.inactivityHours')}
                            </span>
                            <input
                              type="number"
                              min={1}
                              aria-label={`${t('sla.inactivityHours')} · ${cell}`}
                              aria-invalid={Boolean(fieldError(index, 'inactivity_hours'))}
                              className={`${inputClass} w-20`}
                              {...register(`policies.${index}.inactivity_hours`, {
                                valueAsNumber: true,
                              })}
                            />
                          </label>
                        </div>
                        {errorMessage && (
                          <p role="alert" className="text-danger mt-1 text-xs">
                            {errorMessage}
                          </p>
                        )}
                      </Td>
                    )
                  })}
                </tr>
              ))}
          </tbody>
        </Table>
        {save.error && (
          <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
            {translateError(save.error)}
          </p>
        )}
        {saved && (
          <p role="status" className="text-success text-sm">
            {t('sla.saved')}
          </p>
        )}
        <div>
          <Button type="submit" variant="solid" disabled={save.isPending || !policies.data}>
            {save.isPending ? t('common:actions.saving') : t('common:actions.save')}
          </Button>
        </div>
      </form>
    </section>
  )
}
