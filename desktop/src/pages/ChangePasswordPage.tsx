import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { UserMenu } from '@/components/layout/UserMenu'

export function ChangePasswordPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="bg-surface flex w-full max-w-md flex-col gap-5 rounded-xl border p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('changePassword.title')}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t('changePassword.required')}</p>
          </div>
          <UserMenu />
        </div>
        <ChangePasswordForm
          onSuccess={() => {
            void navigate('/', { replace: true })
          }}
        />
      </div>
    </main>
  )
}
