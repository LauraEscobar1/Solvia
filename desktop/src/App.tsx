import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'
import { restoreSession } from '@/lib/auth/session'
import { createQueryClient } from '@/lib/queryClient'
import { router } from '@/router'
import { useThemeSync } from '@/stores/theme'

export function App() {
  useThemeSync()
  const [queryClient] = useState(createQueryClient)

  useEffect(() => {
    void restoreSession()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
