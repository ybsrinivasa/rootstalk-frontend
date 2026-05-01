import api from './api'

export interface AdminUser {
  id: string
  email: string
  name: string | null
  roles: { role_type: string; status: string }[]
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const { data } = await api.post('/auth/admin/login', { email, password })
  localStorage.setItem('rt_token', data.access_token)
  const me = await api.get<AdminUser>('/auth/me')
  localStorage.setItem('rt_user', JSON.stringify(me.data))
}

export function logout(): void {
  localStorage.removeItem('rt_token')
  localStorage.removeItem('rt_user')
  window.location.href = '/login'
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('rt_token')
}

export function getUser(): AdminUser | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('rt_user') || '') } catch { return null }
}
