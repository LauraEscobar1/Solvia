import { CalendarClock } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { InlineAlert } from '@/components/ui/States'
import { TextArea } from '@/components/ui/TextArea'
import { inputClass } from '@/components/ui/styles'
import { useAreaOptions } from '@/lib/api/admin'
import { useTranslateError } from '@/lib/api/errors'
import { useCreateRequest, useDueEstimates } from '@/lib/api/requests'
import { REQUEST_PRIORITIES, type RequestDetail } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

const HOUR_MS = 3_600_000

const requestSchema = z.object({
  title: z.string().trim().min(1, 'required').max(200, 'tooLong'),
  description: z.string().trim().min(1, 'required').max(5000, 'tooLong'),
  area_id: z.string().min(1, 'required'),
  priority: z.enum(REQUEST_PRIORITIES),
})

type RequestValues = z.infer<typeof requestSchema>

interface CreateRequestDialogProps {
  onClose: () => void
  onCreated: (request: RequestDetail) => void
}

function DueEstimateHint({ priority }: { priority: RequestValues['priority'] }) {
  const { t } = useTranslation('requests')
  const { dateTime } = useFormatters()
  const estimates = useDueEstimates()
  const [openedAt] = useState(() => Date.now())
  const hours = estimates.data?.find((estimate) => estimate.priority === priority)?.hours

  if (!estimates.data) return null
  if (hours === null || hours === undefined) {
    return <p className="text-caption text-muted-foreground">{t('create.noEstimate')}</p>
  }
  return (
    <div role="status" className="bg-accent-soft text-accent-text rounded-inner flex items-start gap-3 px-4 py-3">
      <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="text-body font-semibold">{t('create.estimate', { date: dateTime(openedAt + hours * HOUR_MS) })}</p>
        <p className="text-caption">{t('create.estimateHours', { hours })}</p>
      </div>
    </div>
  )
}

export function CreateRequestDialog({ onClose, onCreated }: CreateRequestDialogProps) {
  const { t } = useTranslation(['requests', 'common'])
  const translateError = useTranslateError()
  const areas = useAreaOptions()
  const create = useCreateRequest()
  const ids = { title: useId(), description: useId(), area: useId(), priority: useId() }
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { title: '', description: '', area_id: '', priority: 'medium' },
  })
  const priority = useWatch({ control, name: 'priority' })

  const onSubmit = handleSubmit(async (values) => {
    onCreated(await create.mutateAsync(values))
  })

  return (
    <Dialog title={t('create.title')} onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
        className="flex flex-col gap-4"
      >
        <FormField label={t('create.titleField')} htmlFor={ids.title} error={errors.title?.message}>
          <input
            id={ids.title}
            aria-invalid={Boolean(errors.title)}
            className={inputClass}
            {...register('title')}
          />
        </FormField>
        <FormField
          label={t('create.description')}
          htmlFor={ids.description}
          error={errors.description?.message}
        >
          <TextArea
            id={ids.description}
            rows={4}
            aria-invalid={Boolean(errors.description)}
            {...register('description')}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('create.area')} htmlFor={ids.area} error={errors.area_id?.message}>
            <Select
              id={ids.area}
              aria-invalid={Boolean(errors.area_id)}
              {...register('area_id')}
            >
              <option value="">{t('create.selectArea')}</option>
              {areas.data?.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('create.priority')} htmlFor={ids.priority}>
            <Select id={ids.priority} {...register('priority')}>
              {REQUEST_PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {t(`priority.${option}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <DueEstimateHint priority={priority} />
        {create.error && <InlineAlert tone="error">{translateError(create.error)}</InlineAlert>}
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="accent" loading={create.isPending}>
            {create.isPending ? t('common:actions.saving') : t('create.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
