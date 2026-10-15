import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Language } from '@/locales'
import { apiRequest } from './client'
import type { Area, Page, PageParams, SlaPolicy, SlaStage, RequestPriority, User, UserRole } from './types'

export interface AreaInput {
  name: string
  description: string | null
  manager_id: string | null
}

export interface UserInput {
  full_name: string
  email: string
  role: UserRole
  area_id: string | null
  language?: Language
  temporary_password?: string
}

export interface SlaPolicyInput {
  priority: RequestPriority
  status: SlaStage
  max_hours: number
  inactivity_hours: number
}

export interface UserListParams extends PageParams {
  role?: UserRole
  is_active?: boolean
}

const OPTIONS_PAGE_SIZE = 100

function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export const adminKeys = {
  all: ['admin'] as const,
  areas: () => [...adminKeys.all, 'areas'] as const,
  areaList: (params: PageParams) => [...adminKeys.areas(), 'list', params] as const,
  areaOptions: () => [...adminKeys.areas(), 'options'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  userList: (params: UserListParams) => [...adminKeys.users(), 'list', params] as const,
  managerOptions: () => [...adminKeys.users(), 'managers'] as const,
  sla: () => [...adminKeys.all, 'sla'] as const,
}

export function useAreas(params: PageParams) {
  return useQuery({
    queryKey: adminKeys.areaList(params),
    queryFn: ({ signal }) =>
      apiRequest<Page<Area>>(withQuery('/api/v1/areas', { ...params }), { signal }),
    placeholderData: keepPreviousData,
  })
}

export function useAreaOptions() {
  return useQuery({
    queryKey: adminKeys.areaOptions(),
    queryFn: ({ signal }) =>
      apiRequest<Page<Area>>(
        withQuery('/api/v1/areas', { is_active: true, size: OPTIONS_PAGE_SIZE }),
        { signal },
      ),
    select: (page) => page.items,
  })
}

export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: adminKeys.userList(params),
    queryFn: ({ signal }) =>
      apiRequest<Page<User>>(withQuery('/api/v1/users', { ...params }), { signal }),
    placeholderData: keepPreviousData,
  })
}

export function useManagerOptions() {
  return useQuery({
    queryKey: adminKeys.managerOptions(),
    queryFn: ({ signal }) =>
      apiRequest<Page<User>>(
        withQuery('/api/v1/users', { is_active: true, size: OPTIONS_PAGE_SIZE }),
        { signal },
      ),
    select: (page) => page.items.filter((user) => user.role === 'admin' || user.role === 'supervisor'),
  })
}

export function useSlaPolicies() {
  return useQuery({
    queryKey: adminKeys.sla(),
    queryFn: ({ signal }) => apiRequest<SlaPolicy[]>('/api/v1/sla-policies', { signal }),
  })
}

export function useSaveArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: AreaInput }) =>
      id
        ? apiRequest<Area>(`/api/v1/areas/${id}`, { method: 'PATCH', body: data })
        : apiRequest<Area>('/api/v1/areas', { method: 'POST', body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.areas() }),
  })
}

export function useSetAreaActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest<Area>(`/api/v1/areas/${id}/${active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.areas() }),
  })
}

export function useSaveUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: UserInput }) =>
      id
        ? apiRequest<User>(`/api/v1/users/${id}`, { method: 'PATCH', body: data })
        : apiRequest<User>('/api/v1/users', { method: 'POST', body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  })
}

export function useSetUserActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest<User>(`/api/v1/users/${id}/${active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  })
}

export function useSaveSlaPolicies() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (policies: SlaPolicyInput[]) =>
      apiRequest<SlaPolicy[]>('/api/v1/sla-policies', { method: 'PUT', body: policies }),
    onSuccess: (policies) => {
      queryClient.setQueryData(adminKeys.sla(), policies)
    },
  })
}
