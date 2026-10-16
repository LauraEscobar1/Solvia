import { Outlet } from 'react-router'
import { CriticalAlertNotifier } from '@/components/alerts/CriticalAlertNotifier'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="flex h-full">
      <CriticalAlertNotifier />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
