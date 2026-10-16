import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  type AlertListParams,
  type AlertState,
} from '@/lib/api/types'

export const ALERTS_PAGE_SIZE = 20
export const DEFAULT_ALERT_STATE: AlertState = 'open'
const ANY = 'any'

export type AlertStateFilter = AlertState | typeof ANY

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value)
}

export function alertParamsFromSearch(search: URLSearchParams): AlertListParams {
  const page = Number(search.get('page'))
  const state = search.get('state')
  const read = search.get('is_read')
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: ALERTS_PAGE_SIZE,
    type: search.getAll('type').filter((value) => includes(ALERT_TYPES, value)),
    severity: search.getAll('severity').filter((value) => includes(ALERT_SEVERITIES, value)),
    state:
      state === ANY ? undefined : state === 'resolved' ? 'resolved' : DEFAULT_ALERT_STATE,
    is_read: read === 'true' ? true : read === 'false' ? false : undefined,
  }
}

export function searchFromAlertParams(params: AlertListParams): URLSearchParams {
  const search = new URLSearchParams()
  for (const type of params.type) search.append('type', type)
  for (const severity of params.severity) search.append('severity', severity)
  if (params.state !== DEFAULT_ALERT_STATE) search.set('state', params.state ?? ANY)
  if (params.is_read !== undefined) search.set('is_read', String(params.is_read))
  if (params.page > 1) search.set('page', String(params.page))
  return search
}
