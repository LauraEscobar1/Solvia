import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { router } from '@/router'
import { useThemeSync } from '@/stores/theme'

export function App() {
  useThemeSync()
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
