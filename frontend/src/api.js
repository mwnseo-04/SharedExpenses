function normalizeApiBase(raw) {
  let base = String(raw || '/api').trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(base) && !/\/api$/i.test(base)) {
    base = `${base}/api`
  }
  return base
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL)
const ACCESS_KEY = 'sharedExpenses.access'

export function getAccessMode() {
  try {
    const raw = sessionStorage.getItem(ACCESS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAccessMode(mode, pin = '') {
  sessionStorage.setItem(ACCESS_KEY, JSON.stringify({ mode, pin }))
}

export function clearAccessMode() {
  sessionStorage.removeItem(ACCESS_KEY)
}

async function request(path, options = {}) {
  const access = getAccessMode()
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (access?.mode === 'edit' && access.pin) {
    headers['X-Access-Pin'] = access.pin
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

export const api = {
  unlock: (pin) => request('/auth/unlock', { method: 'POST', body: JSON.stringify({ pin }) }),
  trips: () => request('/trips'),
  trip: (id) => request(`/trips/${id}`),
  createTrip: (payload) => request('/trips', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTrip: (id) => request(`/trips/${id}`, { method: 'DELETE' }),
  addMember: (tripId, name) =>
    request(`/trips/${tripId}/members`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE' }),
  addExpense: (tripId, payload) =>
    request(`/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),
  balances: (tripId) => request(`/trips/${tripId}/balances`),
  settlements: (tripId) => request(`/trips/${tripId}/settlements`),
  analytics: (tripId) => request(`/trips/${tripId}/analytics`),
}
