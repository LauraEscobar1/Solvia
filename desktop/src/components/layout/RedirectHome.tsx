import { Navigate } from 'react-router'

export function RedirectHome() {
  return <Navigate to="/" replace />
}
