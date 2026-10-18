import {
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiQuery, type RequestFilters, type RequestListParams } from '@/lib/requests/filters'
import { alertKeys } from './alerts'
import { apiRequest } from './client'
import { dashboardKeys } from './dashboard'
import type {
  AssignmentSuggestionRead,
  RequestStages,
  BoardCard,
  DueEstimate,
  Page,
  RequestBoard,
  RequestDetail,
  RequestEvent,
  RequestPriority,
  RequestStatus,
  RequestSummary,
  User,
} from './types'

export const EVENTS_PAGE_SIZE = 20
const OPTIONS_PAGE_SIZE = 100

export const requestKeys = {
  all: ['requests'] as const,
  lists: () => [...requestKeys.all, 'list'] as const,
  list: (params: RequestListParams) => [...requestKeys.lists(), params] as const,
  boards: () => [...requestKeys.all, 'board'] as const,
  board: (filters: RequestFilters) => [...requestKeys.boards(), filters] as const,
  detail: (id: string) => [...requestKeys.all, 'detail', id] as const,
  suggestion: (id: string) => [...requestKeys.all, 'suggestion', id] as const,
  stages: (id: string) => [...requestKeys.all, 'stages', id] as const,
  events: (id: string) => [...requestKeys.all, 'events', id] as const,
  dueEstimates: () => [...requestKeys.all, 'due-estimates'] as const,
  assignees: (areaId: string | undefined) => [...requestKeys.all, 'assignees', areaId] as const,
}

export interface NewRequestInput {
  title: string
  description: string
  area_id: string
  priority: RequestPriority
}

export interface RequestUpdateInput {
  version: number
  title?: string
  description?: string
  priority?: RequestPriority
  due_at?: string | null
}

export interface TransitionInput {
  to: RequestStatus
  version: number
  comment?: string
  assignee_id?: string
}

export interface AssignInput {
  assignee_id: string
  version: number
  comment?: string
}

export function invalidateRequest(queryClient: QueryClient, id?: string): Promise<void> {
  const keys: (readonly unknown[])[] = [
    requestKeys.lists(),
    requestKeys.boards(),
    alertKeys.all,
    dashboardKeys.all,
  ]
  if (id) keys.push(requestKeys.detail(id), requestKeys.events(id), requestKeys.suggestion(id), requestKeys.stages(id))
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(
    () => undefined,
  )
}

export function useRequests(params: RequestListParams, enabled = true) {
  return useQuery({
    queryKey: requestKeys.list(params),
    queryFn: ({ signal }) =>
      apiRequest<Page<RequestSummary>>(`/api/v1/requests?${apiQuery(params)}`, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useRequestBoard(filters: RequestFilters, enabled = true) {
  return useQuery({
    queryKey: requestKeys.board(filters),
    queryFn: ({ signal }) =>
      apiRequest<RequestBoard>(`/api/v1/requests/board?${apiQuery(filters)}`, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useRequest(id: string) {
  return useQuery({
    queryKey: requestKeys.detail(id),
    queryFn: ({ signal }) => apiRequest<RequestDetail>(`/api/v1/requests/${id}`, { signal }),
  })
}

export function useRequestStages(id: string) {
  return useQuery({
    queryKey: requestKeys.stages(id),
    queryFn: ({ signal }) => apiRequest<RequestStages>(`/api/v1/requests/${id}/stages`, { signal }),
  })
}

export function useAssignmentSuggestion(id: string) {
  return useQuery({
    queryKey: requestKeys.suggestion(id),
    queryFn: ({ signal }) =>
      apiRequest<AssignmentSuggestionRead>(`/api/v1/requests/${id}/assignment-suggestion`, {
        signal,
      }),
  })
}

export function useRequestEvents(id: string) {
  return useInfiniteQuery({
    queryKey: requestKeys.events(id),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<RequestEvent>>(
        `/api/v1/requests/${id}/events?page=${pageParam}&size=${EVENTS_PAGE_SIZE}`,
        { signal },
      ),
    getNextPageParam: (last) =>
      last.page * last.size < last.total ? last.page + 1 : undefined,
  })
}

export function useDueEstimates() {
  return useQuery({
    queryKey: requestKeys.dueEstimates(),
    queryFn: ({ signal }) => apiRequest<DueEstimate[]>('/api/v1/requests/due-estimates', { signal }),
    staleTime: 5 * 60_000,
  })
}

export function useAssignableUsers(areaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: requestKeys.assignees(areaId),
    enabled,
    queryFn: ({ signal }) => {
      const search = new URLSearchParams({ is_active: 'true', size: String(OPTIONS_PAGE_SIZE) })
      if (areaId) search.set('area_id', areaId)
      return apiRequest<Page<User>>(`/api/v1/users?${search.toString()}`, { signal })
    },
    select: (page) =>
      page.items.filter((user) => user.role === 'assignee' || user.role === 'supervisor'),
  })
}

export function useCreateRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: NewRequestInput) =>
      apiRequest<RequestDetail>('/api/v1/requests', { method: 'POST', body: data }),
    onSuccess: () => invalidateRequest(queryClient),
  })
}

export function moveCard(board: RequestBoard, cardId: string, to: RequestStatus): RequestBoard {
  const card = board.columns.flatMap((column) => column.items).find((item) => item.id === cardId)
  if (!card) return board
  const moved: BoardCard = { ...card, status: to, allowed_transitions: [] }
  return {
    columns: board.columns.map((column) => {
      if (column.status === card.status) {
        return {
          ...column,
          total: Math.max(0, column.total - 1),
          items: column.items.filter((item) => item.id !== cardId),
        }
      }
      if (column.status === to) {
        return { ...column, total: column.total + 1, items: [moved, ...column.items] }
      }
      return column
    }),
  }
}

export function useBoardMove(filters: RequestFilters) {
  const queryClient = useQueryClient()
  const queryKey = requestKeys.board(filters)
  return useMutation({
    mutationFn: ({ card, input }: { card: BoardCard; input: TransitionInput }) =>
      apiRequest<RequestDetail>(`/api/v1/requests/${card.id}/transition`, {
        method: 'POST',
        body: input,
      }),
    onMutate: async ({ card, input }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<RequestBoard>(queryKey)
      if (previous) queryClient.setQueryData(queryKey, moveCard(previous, card.id, input.to))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: (_data, _error, { card }) => invalidateRequest(queryClient, card.id),
  })
}

export function useRequestActions(id: string) {
  const queryClient = useQueryClient()
  const onSuccess = (detail: RequestDetail) => {
    queryClient.setQueryData(requestKeys.detail(id), detail)
  }
  const onSettled = () => invalidateRequest(queryClient, id)
  const path = `/api/v1/requests/${id}`

  const update = useMutation({
    mutationFn: (input: RequestUpdateInput) =>
      apiRequest<RequestDetail>(path, { method: 'PATCH', body: input }),
    onSuccess,
    onSettled,
  })
  const transition = useMutation({
    mutationFn: (input: TransitionInput) =>
      apiRequest<RequestDetail>(`${path}/transition`, { method: 'POST', body: input }),
    onSuccess,
    onSettled,
  })
  const assign = useMutation({
    mutationFn: (input: AssignInput) =>
      apiRequest<RequestDetail>(`${path}/assign`, { method: 'POST', body: input }),
    onSuccess,
    onSettled,
  })
  const comment = useMutation({
    mutationFn: (text: string) =>
      apiRequest<RequestEvent>(`${path}/comments`, { method: 'POST', body: { comment: text } }),
    onSettled,
  })
  return { update, transition, assign, comment }
}
