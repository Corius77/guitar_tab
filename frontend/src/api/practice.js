import axios from './axios'

export const startSession    = (songId)          => axios.post('/practice/sessions/', { song: songId })
export const endSession      = (id, data)         => axios.patch(`/practice/sessions/${id}/`, data)
export const getSongStats    = (songId)           => axios.get(`/practice/songs/${songId}/stats/`)
export const getDashboard    = ()                 => axios.get('/practice/dashboard/')

export const getSavedLoops   = (songId)           => axios.get(`/practice/songs/${songId}/saved-loops/`)
export const createSavedLoop = (songId, data)     => axios.post(`/practice/songs/${songId}/saved-loops/`, data)
export const deleteSavedLoop = (id)               => axios.delete(`/practice/saved-loops/${id}/`)

export const getRecordings   = (songId)           => axios.get(`/practice/songs/${songId}/recordings/`)
export const uploadRecording = (songId, formData) => axios.post(
  `/practice/songs/${songId}/recordings/`, formData,
  { headers: { 'Content-Type': 'multipart/form-data' } }
)
export const deleteRecording = (id)               => axios.delete(`/practice/recordings/${id}/`)
