import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

function importHeaders() {
  const token = localStorage.getItem('storageScoutImportToken')
  return token ? { 'X-Import-Token': token } : {}
}

export const api = {
  getFacilities: (params) =>
    http.get('/facilities', { params }).then((r) => r.data),

  getStats: () =>
    http.get('/stats').then((r) => r.data),

  importState: (stateCode, body) =>
    http.post(`/import/${stateCode}`, body, { headers: importHeaders() }).then((r) => r.data),

  getScan: (scanId) =>
    http.get(`/scan/${scanId}`).then((r) => r.data),

  updateFacility: (id, updates) =>
    http.patch(`/facilities/${id}`, updates).then((r) => r.data),

  getFacilityEntities: (id) =>
    http.get(`/facilities/${id}/entities`).then((r) => r.data),

  getEntities: (params) =>
    http.get('/entities', { params }).then((r) => r.data),

  rebuildEntities: () =>
    http.post('/entities/rebuild', null, { headers: importHeaders() }).then((r) => r.data),
}
