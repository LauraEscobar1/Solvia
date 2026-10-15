import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { signOut } from '@/lib/auth/session'
import { useSessionStore } from '@/stores/session'

export function UserMenu() {
  const { t } = useTranslation('auth')
  const user = useSessionStore((state) => state.user)
  const [signingOut, setSigningOut] = useState(false)

  if (!user) return null

  return (
    <div aria-label={t('session.userMenu')} className="flex items-center gap-3 border-l pl-3">
      <div className="text-right leading-tight">
        <p className="text-sm font-medium">{user.full_name}</p>
        <p className="text-muted-foreground text-xs">{t(`roles.${user.role}`)}</p>
      </div>
      <Button
        variant="ghost"
        aria-label={t('session.signOut')}
        title={t('session.signOut')}
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true)
          void signOut().finally(() => {
            setSigningOut(false)
          })
        }}
        className="px-2"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
