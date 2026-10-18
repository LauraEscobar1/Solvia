import { useTranslation } from 'react-i18next'
import { SelectPill } from '@/components/ui/SelectPill'
import { useAreaOptions } from '@/lib/api/admin'

interface AreaFilterProps {
  value?: string
  onChange: (areaId: string | undefined) => void
}

export function AreaFilter({ value, onChange }: AreaFilterProps) {
  const { t } = useTranslation('dashboard')
  const areas = useAreaOptions()
  return (
    <SelectPill
      label={t('filters.area')}
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value || undefined)
      }}
      className="min-w-56"
    >
      <option value="">{t('filters.allAreas')}</option>
      {areas.data?.map((area) => (
        <option key={area.id} value={area.id}>
          {area.name}
        </option>
      ))}
    </SelectPill>
  )
}
