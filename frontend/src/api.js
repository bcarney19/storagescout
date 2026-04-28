import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

export const api = {
  getFacilities: (params) =>
    http.get('/facilities', { params }).then((r) => r.data),

  getStats: () =>
    http.get('/stats').then((r) => r.data),

  importState: (stateCode, body) =>
    http.post(`/import/${stateCode}`, body).then((r) => r.data),

  getScan: (scanId) =>
    http.get(`/scan/${scanId}`).then((r) => r.data),

  updateFacility: (id, updates) =>
    http.patch(`/facilities/${id}`, updates).then((r) => r.data),
}
