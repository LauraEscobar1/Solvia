import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { LogoMark } from '@/components/brand/LogoMark'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { signOut } from '@/lib/auth/session'

export function ChangePasswordPage() {
  const { t } = useTranslation(['auth', 'common'])
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-10">
      <Card variant="glass" padding="none" className="rounded-feature flex w-full max-w-lg flex-col gap-8 p-11">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LogoMark className="size-10" />
            <span className="text-brand">{t('common:appName')}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            loading={signingOut}
            onClick={() => {
              setSigningOut(true)
              void signOut().finally(() => {
                setSigningOut(false)
              })
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t('changePassword.signOut')}
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-greeting">{t('changePassword.title')}</h1>
          <p className="text-body text-muted-foreground">{t('changePassword.required')}</p>
        </div>
        <ChangePasswordForm
          onSuccess={() => {
            void navigate('/', { replace: true })
          }}
        />
      </Card>
    </main>
  )
}
