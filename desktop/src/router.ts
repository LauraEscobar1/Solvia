import { createHashRouter, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { AdminPage } from '@/pages/AdminPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { RequestsPage } from '@/pages/RequestsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppLayout,
    children: [
      { index: true, Component: DashboardPage },
      { path: 'requests', Component: RequestsPage },
      { path: 'alerts', Component: AlertsPage },
      { path: 'admin', Component: AdminPage },
      { path: 'settings', Component: SettingsPage },
    ],
  },
]

export const router = createHashRouter(routes)
