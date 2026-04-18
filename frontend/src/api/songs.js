import api from './axios'

export const getSongs = (params) =>
  api.get('/songs/', { params })

export const getSong = (id) =>
  api.get(`/songs/${id}/`)

export const uploadSong = (formData) =>
  api.post('/songs/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const updateSong = (id, formData) =>
  api.patch(`/songs/${id}/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const deleteSong = (id) =>
  api.delete(`/songs/${id}/`)

export const playSong = (id) =>
  api.post(`/songs/${id}/play/`)

export const getGenres = () =>
  api.get('/genres/')
