import api from './axios'

export const login = (username, password) =>
  api.post('/auth/login/', { username, password })

export const register = (username, email, password, password2) =>
  api.post('/auth/register/', { username, email, password, password2 })

export const logout = (refresh) =>
  api.post('/auth/logout/', { refresh })

export const getMe = () =>
  api.get('/auth/me/')
