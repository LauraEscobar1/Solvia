import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { inputClass, selectClass } from '@/components/ui/styles'
import { useManagerOptions, useSaveArea } from '@/lib/api/admin'
import { useTranslateError } from '@/lib/api/errors'
import type { Area } from '@/lib/api/types'

const areaSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120, 'tooLong'),
  description: z.string().trim().max(1000, 'tooLong'),
  manager_id: z.string(),
})

type AreaValues = z.infer<typeof areaSchema>

interface AreaFormDialogProps {
  area: Area | null
  onClose: () => void
}

export function AreaFormDialog({ area, onClose }: AreaFormDialogProps) {
  const { t } = useTranslation(['admin', 'common'])
  const translateError = useTranslateError()
  const managers = useManagerOptions()
  const save = useSaveArea()
  const ids = { name: useId(), description: useId(), manager: useId() }
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AreaValues>({
    resolver: zodResolver(areaSchema),
    defaultValues: {
      name: area?.name ?? '',
      description: area?.description ?? '',
      manager_id: area?.manager?.id ?? '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    await save.mutateAsync({
      id: area?.id,
      data: {
        name: values.name,
        description: values.description || null,
        manager_id: values.manager_id || null,
      },
    })
    onClose()
  })

  return (
    <Modal title={area ? t('areas.edit') : t('areas.new')} onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
        className="flex flex-col gap-4"
      >
        <FormField label={t('areas.name')} htmlFor={ids.name} error={errors.name?.message}>
          <input
            id={ids.name}
            aria-invalid={Boolean(errors.name)}
            className={inputClass}
            {...register('name')}
          />
        </FormField>
        <FormField
          label={t('areas.description')}
          htmlFor={ids.description}
          error={errors.description?.message}
        >
          <textarea
            id={ids.description}
            rows={3}
            aria-invalid={Boolean(errors.description)}
            className={inputClass}
            {...register('description')}
          />
        </FormField>
        <FormField label={t('areas.manager')} htmlFor={ids.manager}>
          <select id={ids.manager} className={selectClass} {...register('manager_id')}>
            <option value="">{t('areas.noManager')}</option>
            {area?.manager && !managers.data?.some((user) => user.id === area.manager?.id) && (
              <option value={area.manager.id}>{area.manager.full_name}</option>
            )}
            {managers.data?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </FormField>
        {save.error && (
          <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
            {translateError(save.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? t('common:actions.saving') : t('common:actions.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
