import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Dialog } from '@/components/ui/Dialog'
import { inputClass, selectClass } from '@/components/ui/styles'
import { type UserInput, useAreaOptions, useSaveUser } from '@/lib/api/admin'
import { useTranslateError } from '@/lib/api/errors'
import { type User, USER_ROLES } from '@/lib/api/types'
import { SUPPORTED_LANGUAGES } from '@/locales'

const PASSWORD_MIN = 12
const PASSWORD_MAX = 128

const baseUserSchema = z.object({
  full_name: z.string().trim().min(1, 'required').max(150, 'tooLong'),
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  role: z.enum(USER_ROLES),
  area_id: z.string(),
  language: z.enum(SUPPORTED_LANGUAGES),
})

const createUserSchema = baseUserSchema.extend({
  temporary_password: z.string().min(PASSWORD_MIN, 'passwordMin').max(PASSWORD_MAX, 'tooLong'),
})

const editUserSchema = baseUserSchema.extend({
  temporary_password: z
    .string()
    .max(PASSWORD_MAX, 'tooLong')
    .refine((value) => value === '' || value.length >= PASSWORD_MIN, 'passwordMin'),
})

type UserValues = z.infer<typeof createUserSchema>

interface UserFormDialogProps {
  user: User | null
  onClose: () => void
}

export function UserFormDialog({ user, onClose }: UserFormDialogProps) {
  const { t } = useTranslation(['admin', 'auth', 'common'])
  const translateError = useTranslateError()
  const areas = useAreaOptions()
  const save = useSaveUser()
  const ids = {
    fullName: useId(),
    email: useId(),
    role: useId(),
    area: useId(),
    language: useId(),
    password: useId(),
  }
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserValues>({
    resolver: zodResolver(user ? editUserSchema : createUserSchema),
    defaultValues: {
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      role: user?.role ?? 'requester',
      area_id: user?.area?.id ?? '',
      language: user?.language ?? 'es',
      temporary_password: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    const data: UserInput = {
      full_name: values.full_name,
      email: values.email,
      role: values.role,
      area_id: values.area_id || null,
    }
    if (!user) data.language = values.language
    if (values.temporary_password) data.temporary_password = values.temporary_password
    await save.mutateAsync({ id: user?.id, data })
    onClose()
  })

  return (
    <Dialog title={user ? t('users.edit') : t('users.new')} onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event).catch(() => undefined)}
        className="flex flex-col gap-4"
      >
        <FormField
          label={t('users.fullName')}
          htmlFor={ids.fullName}
          error={errors.full_name?.message}
        >
          <input
            id={ids.fullName}
            aria-invalid={Boolean(errors.full_name)}
            className={inputClass}
            {...register('full_name')}
          />
        </FormField>
        <FormField label={t('users.email')} htmlFor={ids.email} error={errors.email?.message}>
          <input
            id={ids.email}
            type="email"
            aria-invalid={Boolean(errors.email)}
            className={inputClass}
            {...register('email')}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('users.role')} htmlFor={ids.role}>
            <select id={ids.role} className={selectClass} {...register('role')}>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`auth:roles.${role}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('users.area')} htmlFor={ids.area}>
            <select id={ids.area} className={selectClass} {...register('area_id')}>
              <option value="">{t('users.noArea')}</option>
              {user?.area && !areas.data?.some((area) => area.id === user.area?.id) && (
                <option value={user.area.id}>{user.area.name}</option>
              )}
              {areas.data?.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {!user && (
          <FormField label={t('users.language')} htmlFor={ids.language}>
            <select id={ids.language} className={selectClass} {...register('language')}>
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {t(`common:language.${language}`)}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField
          label={user ? t('users.resetPassword') : t('users.temporaryPassword')}
          htmlFor={ids.password}
          error={errors.temporary_password?.message}
          hint={t('users.temporaryPasswordHint')}
        >
          <input
            id={ids.password}
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.temporary_password)}
            className={inputClass}
            {...register('temporary_password')}
          />
        </FormField>
        {save.error && (
          <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm">
            {translateError(save.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="solid" disabled={save.isPending}>
            {save.isPending ? t('common:actions.saving') : t('common:actions.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
