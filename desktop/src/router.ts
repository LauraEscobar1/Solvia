import { createHashRouter, type RouteObject } from 'react-router'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireAdmin } from '@/components/auth/RequireRole'
import { AppLayout } from '@/components/layout/AppLayout'
import { RedirectHome } from '@/components/layout/RedirectHome'
import { AdminIndex, AdminLayout } from '@/pages/admin/AdminLayout'
import { AreasPage } from '@/pages/admin/AreasPage'
import { SlaPage } from '@/pages/admin/SlaPage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { RequestsPage } from '@/pages/RequestsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export const routes: RouteObject[] = [
  { path: '/login', Component: LoginPage },
  {
    Component: RequireAuth,
    children: [
      { path: '/change-password', Component: ChangePasswordPage },
      {
        path: '/',
        Component: AppLayout,
        children: [
          { index: true, Component: DashboardPage },
          { path: 'requests', Component: RequestsPage },
          { path: 'alerts', Component: AlertsPage },
          { path: 'settings', Component: SettingsPage },
          {
            path: 'admin',
            Component: RequireAdmin,
            children: [
              {
                Component: AdminLayout,
                children: [
                  { index: true, Component: AdminIndex },
                  { path: 'areas', Component: AreasPage },
                  { path: 'users', Component: UsersPage },
                  { path: 'sla', Component: SlaPage },
                ],
              },
            ],
          },
          { path: '*', Component: RedirectHome },
        ],
      },
    ],
  },
]

export const router = createHashRouter(routes)
