import { API } from './config.js'

export async function request(path, options) {
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include' })
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Bir hata oluştu')
  return data
}
