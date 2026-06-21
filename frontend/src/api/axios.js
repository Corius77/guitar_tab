import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 try to refresh; on failure redirect to login.
// Współbieżne żądania współdzielą jeden refresh w locie (refreshPromise),
// żeby nie wystrzelić wielu requestów refresh równolegle.
let refreshPromise = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh')
      if (refresh) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios.post('/api/auth/token/refresh/', { refresh })
              .finally(() => { refreshPromise = null })
          }
          const { data } = await refreshPromise
          localStorage.setItem('access', data.access)
          // Jeśli backend ma włączoną rotację tokenów refresh, zapisz nowy.
          if (data.refresh) localStorage.setItem('refresh', data.refresh)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          localStorage.removeItem('access')
          localStorage.removeItem('refresh')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
