// En Electron se carga desde file://, necesita URL absoluta al backend
const isElectron = window.location.protocol === 'file:'
const BASE = import.meta.env.VITE_API_URL || (isElectron ? 'http://localhost:3001/api' : '/api')

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Error de red')
  }
  return res.json()
}

export const api = {
  // Canales
  getChannels: ()           => req('/channels'),
  addChannel:  (username)   => req('/channels', { method: 'POST', body: JSON.stringify({ username }) }),
  deleteChannel: (id)       => req(`/channels/${id}`, { method: 'DELETE' }),
  indexChannel: (id)        => req(`/channels/${id}/index`, { method: 'POST' }),

  // Archivos
  getFiles: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return req(`/files?${qs}`)
  },
  getTree:  (channelId)   => req(`/tree/${channelId}`),
  search:   (q, channelId) => {
    const qs = new URLSearchParams({ q, ...(channelId ? { channel_id: channelId } : {}) }).toString()
    return req(`/search?${qs}`)
  },

  // Descarga y thumbnail
  downloadUrl: (fileId) => `${BASE}/download/${fileId}`,
  thumbUrl:    (fileId) => `${BASE}/thumb/${fileId}`,
  previewUrl:  (fileId) => `${BASE}/preview/${fileId}`,

  // Subir
  upload: (channelId, filePath, file, jobId) => {
    const fd = new FormData()
    fd.append('channel_id', channelId)
    fd.append('path', filePath)
    fd.append('file', file)
    if (jobId) fd.append('job_id', jobId)
    return fetch(BASE + '/upload', { method: 'POST', body: fd }).then(r => r.json())
  },

  uploadProgressUrl: (jobId) => `${BASE}/upload-progress/${jobId}`,
  downloadSession: (fileId) => req(`/download-session/${fileId}`),
  downloadSessionsActive: () => req('/download-sessions/active'),
  downloadPrepare: (fileId) => req(`/download-prepare/${fileId}`, { method: 'POST' }),
  downloadProgressUrl: (jobId) => `${BASE}/download-progress/${jobId}`,
  downloadServeUrl: (jobId) => `${BASE}/download-serve/${jobId}`,

  // Carpetas
  getFolders: (channelId, path) => {
    const qs = new URLSearchParams({ channel_id: channelId, path }).toString()
    return req('/folders?' + qs)
  },
  createFolder: (channelId, path, name) => req('/folders', {
    method: 'POST',
    body: JSON.stringify({ channel_id: channelId, path, name }),
  }),
  deleteFolder: (id) => req('/folders/' + id, { method: 'DELETE' }),

  // Borrar archivo
  deleteFile: (id) => req('/files/' + id, { method: 'DELETE' }),

  // Mover archivo
  moveFile: (id, newPath) => req('/files/' + id, {
    method: 'PATCH',
    body: JSON.stringify({ path: newPath }),
  }),

  // Sync
  pushManifest: (id) => req('/channels/' + id + '/push', { method: 'POST' }),
  pullManifest: (id) => req('/channels/' + id + '/pull', { method: 'POST' }),

  // Buscar canales en Telegram
  searchChannels: (q) => req(`/channels/search?q=${encodeURIComponent(q)}`),

  // Setup
  setupStatus: () => req('/setup/status'),
  setupInit: (apiId, apiHash) => req('/setup/init', { method: 'POST', body: JSON.stringify({ apiId, apiHash }) }),
  setupSendCode: (phone) => req('/setup/send-code', { method: 'POST', body: JSON.stringify({ phone }) }),
  setupSignIn: (code) => req('/setup/sign-in', { method: 'POST', body: JSON.stringify({ code }) }),
  setup2fa: (password) => req('/setup/2fa', { method: 'POST', body: JSON.stringify({ password }) }),

  // Stats
  getStats: () => req('/stats'),
}
