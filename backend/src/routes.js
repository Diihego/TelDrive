import express from 'express'
import db from './db.js'
import { getClient, resolveChannel, getChannelEntity } from './telegram.js'
import { pushManifest, pushManifestNow, pullManifest } from './sync.js'
import { getThumb } from './thumb.js'
import { indexChannel, startLiveIndexer } from './indexer.js'
import { isConfigured, getSetupState, initSetup, sendCode, signIn, verify2fa } from './setup.js'
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const CHUNK_SIZE = 1_000_000_000 // 1 GB
const UPLOAD_TMP = path.join(os.tmpdir(), 'teldrive-uploads')
fs.mkdirSync(UPLOAD_TMP, { recursive: true })

const uploadJobs = new Map()
function setJob(jobId, data) {
  if (!jobId) return
  uploadJobs.set(jobId, { ...(uploadJobs.get(jobId) || {}), ...data })
}

const downloadJobs = new Map() // jobId → { status, progress, speed, name, size, tmpPath, error }
const DOWNLOAD_TMP = path.join(os.tmpdir(), 'teldrive-downloads')
fs.mkdirSync(DOWNLOAD_TMP, { recursive: true })

// Las sesiones 'preparing' quedaron incompletas — limpiarlas para que el frontend las reencole
// Las 'ready' se conservan: el archivo tmp sigue ahí y se puede guardar directo
try { db.prepare(`DELETE FROM download_sessions WHERE status='preparing'`).run() } catch {}

function setDJob(jobId, data) {
  downloadJobs.set(jobId, { ...(downloadJobs.get(jobId) || {}), ...data })
}

function writeChunk(srcPath, destPath, start, end) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(srcPath, { start, end })
    const ws = fs.createWriteStream(destPath)
    rs.pipe(ws)
    ws.on('finish', resolve)
    ws.on('error', reject)
    rs.on('error', reject)
  })
}

function buildTree(paths) {
  const root = { name: '/', path: '/', children: [], count: 0 }
  for (const { path, count, id } of paths) {
    const parts = path.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean)
    let node = root
    let current = '/'
    for (let i = 0; i < parts.length; i++) {
      current = current + parts[i] + '/'
      let child = node.children.find(c => c.path === current)
      if (!child) {
        child = { name: parts[i], path: current, children: [], count: 0 }
        node.children.push(child)
      }
      // Asignar id solo al nodo hoja exacto
      if (i === parts.length - 1 && id) child.id = id
      child.count += count
      node = child
    }
    if (parts.length === 0) root.count += count
  }
  return root
}

const router = express.Router()
const upload = multer({ dest: UPLOAD_TMP })

// ─── Setup / Onboarding ───────────────────────────────────────────────────────

router.get('/setup/status', (req, res) => {
  const configured = isConfigured()
  console.log('[setup] status check — configured:', configured, '| dataDir:', process.env.TELDRIVE_DATA_DIR)
  res.json({ configured, stage: getSetupState().stage })
})

router.post('/setup/init', async (req, res) => {
  const { apiId, apiHash } = req.body
  if (!apiId || !apiHash) return res.status(400).json({ error: 'apiId y apiHash requeridos' })
  try {
    await initSetup(apiId, apiHash)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/setup/send-code', async (req, res) => {
  const { phone } = req.body
  if (!phone) return res.status(400).json({ error: 'phone requerido' })
  try {
    await sendCode(phone)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/setup/sign-in', async (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'code requerido' })
  try {
    const result = await signIn(code)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/setup/2fa', async (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'password requerido' })
  try {
    const result = await verify2fa(password)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── SSE: progreso de upload ──────────────────────────────────────────────────

router.get('/upload-progress/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const { jobId } = req.params
  let waited = 0

  const iv = setInterval(() => {
    const job = uploadJobs.get(jobId)
    if (!job) {
      if ((waited += 200) > 30000) { clearInterval(iv); res.end() }
      return
    }
    res.write(`data: ${JSON.stringify(job)}\n\n`)
    if (job.status === 'done' || job.status === 'error') {
      clearInterval(iv)
      setTimeout(() => { uploadJobs.delete(jobId); res.end() }, 3000)
    }
  }, 200)

  req.on('close', () => clearInterval(iv))
})

// ─── Canales ──────────────────────────────────────────────────────────────────

router.get('/channels', (req, res) => {
  const channels = db.prepare(`
    SELECT c.*, COUNT(f.id) as file_count, SUM(f.size) as total_size
    FROM channels c
    LEFT JOIN files f ON f.channel_id = c.id AND (f.part_num IS NULL OR f.part_num = 1)
    GROUP BY c.id
    ORDER BY c.name
  `).all()
  res.json(channels)
})

router.post('/channels', async (req, res) => {
  const { username } = req.body
  if (!username) return res.status(400).json({ error: 'username requerido' })
  try {
    const entity = await resolveChannel(username)
    if (!entity) return res.status(404).json({ error: 'Canal no encontrado en Telegram' })

    const tgId = String(entity.id)
    const name = entity.title || entity.username || username
    const existing = db.prepare('SELECT * FROM channels WHERE tg_id = ?').get(tgId)
    if (existing) return res.status(409).json({ error: 'Canal ya agregado', channel: existing })

    const accessHash = entity.accessHash ? String(entity.accessHash) : null
    const result = db.prepare(
      'INSERT INTO channels (tg_id, name, username, access_hash) VALUES (?, ?, ?, ?)'
    ).run([tgId, name, entity.username || null, accessHash])

    const channel = (result.lastInsertRowid &&
      db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid)) ||
      db.prepare('SELECT * FROM channels WHERE tg_id = ?').get(tgId)

    // Detectar si es canal ajeno (no owner/admin) — no podrá descargar archivos
    const isOwner = entity.creator === true
    const isAdmin = entity.adminRights && (entity.adminRights.postMessages || entity.adminRights.deleteMessages)
    const canDownload = isOwner || isAdmin

    res.json({ ...(channel || { tg_id: tgId, name, ok: true }), canDownload, warning: canDownload ? null : 'Este canal es ajeno. Podés ver los archivos pero no descargarlos a menos que seas administrador.' })
    if (channel && channel.id) {
      pullManifest(channel.id).catch(e => console.error('[sync] pull error:', e.message))
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/channels/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase()
  try {
    const c = await getClient()
    const dialogs = await c.getDialogs({ limit: 200 })
    const results = dialogs
      .filter(d => {
        const e = d.entity
        if (!e) return false
        if (e.className !== 'Channel' && e.className !== 'Chat') return false
        if (!e.creator) return false
        if (!q) return true
        return (e.title || '').toLowerCase().includes(q) ||
               (e.username || '').toLowerCase().includes(q)
      })
      .map(d => ({
        tg_id: String(d.entity.id),
        name: d.entity.title,
        username: d.entity.username || null,
        members: d.entity.participantsCount || null,
      }))
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/channels/:id', (req, res) => {
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.post('/channels/:id/index', async (req, res) => {
  try {
    const result = await indexChannel(parseInt(req.params.id))
    res.json(result)
    // Actualizar manifest después de indexar para que otros PCs reciban los cambios
    pushManifest(parseInt(req.params.id)).catch(e => console.error('[index] push error:', e.message))
  } catch (err) {
    console.error('[index] Error:', err)
    res.status(500).json({ error: err.message, stack: err.stack })
  }
})

router.post('/channels/:id/push', async (req, res) => {
  try {
    await pushManifest(parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/channels/:id/pull', async (req, res) => {
  try {
    const result = await pullManifest(parseInt(req.params.id))
    res.json(result || { files: 0, folders: 0, imported: 0, foldersImported: 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Tamaño de carpeta ────────────────────────────────────────────────────────

router.get('/folder-size', (req, res) => {
  const { channel_id, path = '/' } = req.query
  if (!channel_id) return res.status(400).json({ error: 'channel_id requerido' })
  const prefix = path.endsWith('/') ? path : path + '/'
  const row = db.prepare(`
    SELECT COUNT(f.id) as count, SUM(f.size) as size
    FROM files f
    WHERE f.channel_id = ? AND (f.path = ? OR f.path LIKE ?) AND (f.part_num IS NULL OR f.part_num = 1)
  `).get([channel_id, prefix, prefix + '%'])
  res.json({ count: row.count || 0, size: row.size || 0 })
})

// ─── Archivos ─────────────────────────────────────────────────────────────────

router.get('/files', async (req, res) => {
  const { channel_id, path = '/', type, q, page = 1, limit = 50, sort = 'name', dir = 'asc' } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const SORT_COLS = { name: 'COALESCE(f.part_name, f.name)', date: 'f.date', size: 'total_size', type: 'f.type' }
  const sortCol = SORT_COLS[sort] || SORT_COLS.name
  const sortDir = dir === 'desc' ? 'DESC' : 'ASC'

  let where = ['1=1']
  let params = []

  if (channel_id) { where.push('f.channel_id = ?'); params.push(channel_id) }
  if (path !== undefined) { where.push('f.path = ?'); params.push(path) }
  if (type) { where.push('f.type = ?'); params.push(type) }
  if (q) { where.push('(f.name LIKE ? OR f.part_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
  where.push('(f.part_num IS NULL OR f.part_num = 1)')

  const whereStr = where.join(' AND ')

  const files = db.prepare(`
    SELECT f.*, c.name as channel_name,
      COALESCE(f.alias, f.part_name, f.name) as display_name,
      CASE WHEN f.part_total IS NOT NULL THEN (
        SELECT SUM(p.size) FROM files p WHERE p.part_group = f.part_group
      ) ELSE f.size END as total_size
    FROM files f
    JOIN channels c ON c.id = f.channel_id
    WHERE ${whereStr}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all([...params, parseInt(limit), offset])

  const { guessType } = await import('./telegram.js')
  files.forEach(f => {
    // alias tiene prioridad sobre todo
    if (f.alias) f.name = f.alias
    else if (f.part_name) {
      f.name = f.part_name
      f.size = f.total_size
      if (!f.type || f.type === 'other') f.type = guessType(f.mime_type, f.part_name)
    }
  })

  const total = db.prepare(`SELECT COUNT(*) as n FROM files f WHERE ${whereStr}`).get(params).n
  res.json({ files, total, page: parseInt(page), limit: parseInt(limit) })
})

router.get('/tree/:channel_id', (req, res) => {
  const { channel_id } = req.params
  const filePaths = db.prepare(`
    SELECT DISTINCT path, COUNT(*) as count
    FROM files WHERE channel_id = ?
    GROUP BY path ORDER BY path
  `).all(channel_id)

  const explicitFolders = db.prepare(
    'SELECT id, full_path as path FROM folders WHERE channel_id = ?'
  ).all(channel_id).map(f => ({ id: f.id, path: f.path, count: 0 }))

  const seen = new Set(filePaths.map(p => p.path))
  const allPaths = [...filePaths, ...explicitFolders.filter(f => !seen.has(f.path))]
  res.json(buildTree(allPaths))
})

router.get('/search', (req, res) => {
  const { q, channel_id } = req.query
  if (!q) return res.json([])
  let sql = `SELECT f.*, COALESCE(f.alias, f.part_name, f.name) as display_name, c.name as channel_name FROM files f JOIN channels c ON c.id = f.channel_id WHERE (f.name LIKE ? OR f.alias LIKE ?)`
  const params = [`%${q}%`, `%${q}%`]
  if (channel_id) { sql += ' AND f.channel_id = ?'; params.push(channel_id) }
  sql += ' LIMIT 100'
  res.json(db.prepare(sql).all(params))
})

router.delete('/files/:id', async (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })

  // Recolectar todos los message_ids a borrar (multipart o simple)
  const filesToDelete = file.part_group
    ? db.prepare('SELECT * FROM files WHERE part_group = ?').all(file.part_group)
    : [file]
  const messageIds = [...new Set(filesToDelete.map(f => f.message_id).filter(Boolean))]

  // Borrar mensajes en Telegram
  try {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(file.channel_id)
    const client = await getClient()
    const entity = await getChannelEntity(channel.tg_id, channel.access_hash)
    await client.deleteMessages(entity, messageIds, { revoke: true })
  } catch (err) {
    console.error('[delete] Error al borrar en Telegram:', err.message)
    // No bloqueamos — igual borramos del índice
  }

  // Borrar del índice local
  if (file.part_group) {
    db.prepare('DELETE FROM files WHERE part_group = ?').run(file.part_group)
  } else {
    db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id)
  }
  try { await pushManifestNow(file.channel_id) } catch (e) { console.error('[sync] push error:', e.message) }
  res.json({ ok: true })
})

router.patch('/files/:id', (req, res) => {
  const { path: newPath, name: newName } = req.body
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })
  if (newName !== undefined) {
    db.prepare('UPDATE files SET alias = ? WHERE id = ?').run([newName.trim(), file.id])
    if (file.part_group) db.prepare('UPDATE files SET alias = ? WHERE part_group = ?').run([newName.trim(), file.part_group])
  }
  if (newPath !== undefined) {
    const normalized = newPath.replace(/\/?$/, '/').replace(/^([^/])/, '/$1')
    db.prepare('UPDATE files SET path = ? WHERE id = ?').run([normalized, file.id])
    if (file.part_group) db.prepare('UPDATE files SET path = ? WHERE part_group = ?').run([normalized, file.part_group])
  }
  pushManifest(file.channel_id).catch(e => console.error('[sync] push error:', e.message))
  res.json({ ok: true })
})

// ─── Foto de canal ────────────────────────────────────────────────────────────

router.get('/channels/:id/photo', async (req, res) => {
  try {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id)
    if (!channel) return res.status(404).end()
    const client = await getClient()
    const entity = await getChannelEntity(channel.tg_id, channel.access_hash)
    const photo = await client.downloadProfilePhoto(entity, { isBig: false })
    if (!photo || !photo.length) return res.status(404).end()
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(photo))
  } catch (err) {
    res.status(404).end()
  }
})

// ─── Thumb / Preview ──────────────────────────────────────────────────────────

router.get('/thumb/:file_id', async (req, res) => {
  try {
    const thumbPath = await getThumb(req.params.file_id)
    if (!thumbPath) return res.status(404).json({ error: 'Sin thumbnail' })
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=604800')
    res.sendFile(thumbPath)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/preview/:file_id', async (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.file_id)
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })
  if (!['image', 'video'].includes(file.type)) return res.status(400).json({ error: 'Solo imagenes y videos' })
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(file.channel_id)
  const client = await getClient()
  try {
    const entity = await getChannelEntity(channel.tg_id, channel.access_hash)
    const messages = await client.getMessages(entity, { ids: [file.message_id] })
    if (!messages[0]) return res.status(404).json({ error: 'Mensaje no encontrado' })
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(file.name) + '"')
    if (file.size) res.setHeader('Content-Length', file.size)
    for await (const chunk of client.iterDownload({ file: messages[0].media, requestSize: 1024 * 1024 })) {
      const ok = res.write(Buffer.from(chunk))
      if (!ok) await new Promise(resolve => res.once('drain', resolve))
    }
    res.end()
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message })
    else res.destroy()
  }
})

// ─── Download ─────────────────────────────────────────────────────────────────

// Descarga resumable de un mensaje de Telegram a un archivo en disco
async function downloadToFile(clientIn, message, destPath, onProgress) {
  const { Api } = await import('telegram')
  let client = clientIn  // mutable: se renueva si se desconecta
  const doc = message.media?.document
  if (!doc) throw new Error('El mensaje no tiene documento')

  const CHUNK    = 1024 * 1024  // 1 MB — máximo del protocolo MTProto
  const PARALLEL = 2             // óptimo según pruebas: mínimo flood wait, máxima velocidad
  const progressPath = destPath + '.progress'

  let offset = 0
  if (fs.existsSync(progressPath) && fs.existsSync(destPath)) {
    offset = parseInt(fs.readFileSync(progressPath, 'utf8') || '0') || 0
    console.log(`[download] reanudando desde byte ${offset}`)
  }

  const inputLocation = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: '',
  })

  const ws = fs.createWriteStream(destPath, { flags: offset > 0 ? 'r+' : 'w', start: offset })

  async function fetchChunk(chunkOffset) {
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const result = await client.invoke(new Api.upload.GetFile({
          location: inputLocation,
          offset: BigInt(chunkOffset),
          limit: CHUNK,
          precise: true,
        }))
        return Buffer.from(result.bytes)
      } catch (err) {
        console.warn(`[download] GetFile intento ${attempt}/8 offset=${chunkOffset}: ${err.message}`)
        if (attempt >= 8) throw err
        const isDisconnect = /not connected|disconnected|connection/i.test(err.message || '')
        if (isDisconnect) {
          console.log('[download] Conexión perdida, reconectando...')
          try { client = await getClient() } catch (e) { console.warn('[download] Error reconectando:', e.message) }
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        const floodMatch = err.message?.match(/FLOOD_WAIT_(\d+)/) || err.message?.match(/flood wait[^0-9]*(\d+)/i)
        const waitMs = floodMatch
          ? parseInt(floodMatch[1]) * 1000 + 1000
          : Math.min(30000, 500 * Math.pow(2, attempt - 1))
        await new Promise(r => setTimeout(r, waitMs))
      }
    }
  }

  try {
    while (true) {
      const offsets = []
      for (let i = 0; i < PARALLEL; i++) offsets.push(offset + i * CHUNK)

      const results = await Promise.all(offsets.map(o => fetchChunk(o)))

      let done = false
      for (const bytes of results) {
        if (!bytes || bytes.length === 0) { done = true; break }
        const ok = ws.write(bytes)
        if (!ok) await new Promise(r => ws.once('drain', r))
        offset += bytes.length
        onProgress(bytes.length)
        if (bytes.length < CHUNK) { done = true; break }
      }

      fs.writeFileSync(progressPath, String(offset))
      if (done) break
    }

    await new Promise((resolve, reject) => ws.end(err => err ? reject(err) : resolve()))
    fs.unlink(progressPath, () => {})
  } catch (err) {
    ws.destroy()
    throw err
  }
}

// 0a) Verificar si ya existe sesión lista o en curso para este archivo
router.get('/download-session/:file_id', (req, res) => {
  // Primero buscar sesión lista
  const ready = db.prepare(
    `SELECT * FROM download_sessions WHERE file_id=? AND status='ready' ORDER BY id DESC LIMIT 1`
  ).get(req.params.file_id)

  if (ready && fs.existsSync(ready.tmp_path)) {
    if (!downloadJobs.has(ready.job_id)) {
      setDJob(ready.job_id, { status: 'ready', name: ready.file_name, size: ready.total_size, tmpPath: ready.tmp_path })
    }
    return res.json({ jobId: ready.job_id, status: 'ready' })
  }

  // Luego buscar sesión en progreso
  const preparing = db.prepare(
    `SELECT * FROM download_sessions WHERE file_id=? AND status='preparing' ORDER BY id DESC LIMIT 1`
  ).get(req.params.file_id)

  if (preparing) {
    return res.json({ jobId: preparing.job_id, status: 'preparing' })
  }

  res.json({ jobId: null, status: null })
})

// 0b) Listar todas las sesiones activas (para restaurar al recargar)
router.get('/download-sessions/active', (req, res) => {
  const sessions = db.prepare(
    `SELECT * FROM download_sessions WHERE status IN ('preparing', 'ready') ORDER BY id DESC`
  ).all()

  // Limpiar las que ya no tienen archivo en disco
  const valid = sessions.filter(s => {
    // Limpiar sesiones 'ready' sin archivo en disco
    if (s.status === 'ready' && !fs.existsSync(s.tmp_path)) {
      db.prepare(`DELETE FROM download_sessions WHERE job_id=?`).run(s.job_id)
      return false
    }
    // Limpiar sesiones 'preparing' huérfanas (backend se reinició)
    if (s.status === 'preparing' && !downloadJobs.has(s.job_id)) {
      db.prepare(`DELETE FROM download_sessions WHERE job_id=?`).run(s.job_id)
      return false
    }
    return true
  })

  // Restaurar en memoria las que falten
  valid.forEach(s => {
    if (!downloadJobs.has(s.job_id)) {
      const inMemory = downloadJobs.get(s.job_id)
      if (!inMemory) {
        setDJob(s.job_id, {
          status: s.status,
          name: s.file_name,
          size: s.total_size,
          tmpPath: s.tmp_path,
          progress: s.status === 'ready' ? 100 : 0,
          speed: 0,
        })
      }
    }
  })

  // Marcar las 'ready' como notificadas para que no vuelvan a salir
  valid.filter(s => s.status === 'ready' && !s.notified).forEach(s => {
    db.prepare(`UPDATE download_sessions SET notified=1 WHERE job_id=?`).run(s.job_id)
  })

  // Solo devolver las no notificadas (las 'preparing' siempre, las 'ready' solo la primera vez)
  const toShow = valid.filter(s => s.status === 'preparing' || !s.notified)

  res.json(toShow.map(s => ({
    jobId: s.job_id,
    fileId: s.file_id,
    name: s.file_name,
    size: s.total_size,
    status: s.status,
    inMemory: downloadJobs.has(s.job_id),
  })))
})

// 1) Iniciar preparación: descarga de Telegram → disco local
router.post('/download-prepare/:file_id', async (req, res) => {
  const fileId = parseInt(req.params.file_id)
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId)
  if (!file) {
    console.error('[download] Archivo ID', fileId, 'no encontrado en DB. Total archivos:', db.prepare('SELECT COUNT(*) as n FROM files').get()?.n)
    return res.status(404).json({ error: 'Archivo no encontrado (ID: ' + fileId + ')' })
  }

  const jobId = crypto.randomUUID()
  const fileName = file.part_name || file.name
  const tmpPath = path.join(DOWNLOAD_TMP, jobId + '_' + fileName)

  // Calcular tamaño total
  let totalSize = Number(file.size) || 0
  let parts = null
  if (file.part_group) {
    parts = db.prepare('SELECT * FROM files WHERE part_group = ? ORDER BY part_num').all(file.part_group)
    totalSize = parts.reduce((s, p) => s + (Number(p.size) || 0), 0)
  }

  // Evitar duplicados — si ya hay una sesión en curso para este archivo, devolverla
  const existing = db.prepare(
    `SELECT * FROM download_sessions WHERE file_id=? AND status='preparing' ORDER BY id DESC LIMIT 1`
  ).get(file.id)
  if (existing) {
    return res.json({ jobId: existing.job_id, name: existing.file_name, size: existing.total_size, resumed: true })
  }

  setDJob(jobId, { status: 'preparing', progress: 0, speed: 0, name: fileName, size: totalSize, tmpPath })

  // Persistir sesión en DB
  db.prepare(`INSERT OR REPLACE INTO download_sessions (job_id, file_id, file_name, tmp_path, total_size, status) VALUES (?, ?, ?, ?, ?, 'preparing')`)
    .run([jobId, file.id, fileName, tmpPath, totalSize])

  res.json({ jobId, name: fileName, size: totalSize })

  // Descargar en background
  ;(async () => {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(file.channel_id)
    const client = await getClient()
    const entity = await getChannelEntity(channel.tg_id, channel.access_hash)
    const filesToStream = parts || [file]
    const partPaths = []
    let received = 0, lastReceived = 0, lastTime = Date.now()

    function updateProgress(chunkLen) {
      received += chunkLen
      const now = Date.now()
      const dt = (now - lastTime) / 1000
      if (dt >= 0.5) {
        const speed = dt > 0 ? (received - lastReceived) / dt : 0
        lastReceived = received; lastTime = now
        setDJob(jobId, {
          progress: totalSize > 0 ? Math.min(99, Math.floor(received / totalSize * 100)) : 0,
          speed, status: 'preparing',
          part: partPaths.length,
          partTotal: filesToStream.length,
        })
      }
    }

    async function downloadPart(f, partPath) {
      const c = await getClient()  // siempre obtener cliente fresco (reconecta si hace falta)
      const messages = await c.getMessages(entity, { ids: [f.message_id] })
      if (!messages[0]) throw new Error('Mensaje no encontrado. Si no sos admin del canal, Telegram puede restringir el acceso a los archivos.')
      if (!messages[0].media) throw new Error('Sin acceso al archivo. Para descargar desde canales ajenos necesitás ser administrador con permisos de descarga.')
      await downloadToFile(c, messages[0], partPath, updateProgress)
    }

    try {
      // 1. Bajar cada parte a su propio archivo temp
      for (let i = 0; i < filesToStream.length; i++) {
        const partNum = i + 1
        const partPath = path.join(DOWNLOAD_TMP, `${jobId}_part${partNum}`)
        partPaths.push(partPath)
        setDJob(jobId, { part: partNum, partTotal: filesToStream.length })
        console.log(`[download] bajando parte ${partNum}/${filesToStream.length}... [${new Date().toLocaleTimeString()}]`)
        await downloadPart(filesToStream[i], partPath)
        console.log(`[download] parte ${partNum} lista [${new Date().toLocaleTimeString()}]`)
      }

      // 2. Concatenar todas las partes en el archivo final
      if (partPaths.length > 1) {
        console.log(`[download] concatenando ${partPaths.length} partes...`)
        setDJob(jobId, { status: 'preparing', progress: 99, speed: 0, part: filesToStream.length, partTotal: filesToStream.length })
        const finalWs = fs.createWriteStream(tmpPath)
        for (const pp of partPaths) {
          await new Promise((resolve, reject) => {
            const rs = fs.createReadStream(pp)
            rs.pipe(finalWs, { end: false })
            rs.on('end', resolve)
            rs.on('error', reject)
          })
          fs.unlink(pp, () => {})
        }
        await new Promise((resolve, reject) => finalWs.end(err => err ? reject(err) : resolve()))
      } else {
        // Solo una parte, renombrar directamente
        fs.renameSync(partPaths[0], tmpPath)
      }

      setDJob(jobId, { status: 'ready', progress: 100, speed: 0 })
      db.prepare(`UPDATE download_sessions SET status='ready' WHERE job_id=?`).run(jobId)
      console.log(`[download] listo: ${fileName} → ${tmpPath}`)

      // 2 horas de fallback — por si el usuario nunca termina la descarga
      setTimeout(() => {
        fs.unlink(tmpPath, () => {})
        downloadJobs.delete(jobId)
        db.prepare(`DELETE FROM download_sessions WHERE job_id=?`).run(jobId)
      }, 2 * 60 * 60 * 1000)
    } catch (err) {
      partPaths.forEach(pp => fs.unlink(pp, () => {}))
      fs.unlink(tmpPath, () => {})
      setDJob(jobId, { status: 'error', error: err.message })
      console.error('[download] error:', err.message)
    }
  })()
})

// 2) SSE: progreso de preparación
router.get('/download-progress/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const { jobId } = req.params
  let waited = 0

  const iv = setInterval(() => {
    const job = downloadJobs.get(jobId)
    if (!job) {
      if ((waited += 200) > 10000) { clearInterval(iv); res.end() }
      return
    }
    res.write(`data: ${JSON.stringify(job)}\n\n`)
    if (job.status === 'ready' || job.status === 'error') {
      clearInterval(iv)
      setTimeout(() => res.end(), 1000)
    }
  }, 200)

  req.on('close', () => clearInterval(iv))
})

// 3) Servir el archivo desde disco (Express maneja Range automáticamente)
router.get('/download-serve/:jobId', (req, res) => {
  const job = downloadJobs.get(req.params.jobId)
  if (!job || job.status !== 'ready') return res.status(404).json({ error: 'Archivo no disponible' })
  if (!fs.existsSync(job.tmpPath)) return res.status(404).json({ error: 'Archivo expirado' })

  res.download(job.tmpPath, job.name, (err) => {
    if (err && !res.headersSent) return res.status(500).json({ error: err.message })
    // Borrar el temp una vez descargado exitosamente
    if (!err) {
      fs.unlink(job.tmpPath, () => {})
      downloadJobs.delete(req.params.jobId)
      db.prepare(`DELETE FROM download_sessions WHERE job_id=?`).run(req.params.jobId)
    }
  })
})

// 4) Cancelar descarga en curso
router.delete('/download-prepare/:jobId', (req, res) => {
  const { jobId } = req.params
  const job = downloadJobs.get(jobId)
  if (job) {
    setDJob(jobId, { status: 'cancelled' })
    if (job.tmpPath) fs.unlink(job.tmpPath, () => {})
    downloadJobs.delete(jobId)
    db.prepare(`DELETE FROM download_sessions WHERE job_id=?`).run(jobId)
  }
  res.json({ ok: true })
})

// 5) Guardar archivo ya listo en una carpeta de destino (carpeta default)
router.post('/download-save/:jobId', (req, res) => {
  const { targetDir, fileName } = req.body
  const job = downloadJobs.get(req.params.jobId)
  if (!job || job.status !== 'ready') return res.status(404).json({ error: 'Archivo no disponible' })
  if (!fs.existsSync(job.tmpPath)) return res.status(404).json({ error: 'Archivo expirado' })
  if (!targetDir) return res.status(400).json({ error: 'targetDir requerido' })

  const dest = path.join(targetDir, fileName || job.name)
  fs.copyFile(job.tmpPath, dest, (err) => {
    if (err) return res.status(500).json({ error: err.message })
    fs.unlink(job.tmpPath, () => {})
    downloadJobs.delete(req.params.jobId)
    db.prepare(`DELETE FROM download_sessions WHERE job_id=?`).run(req.params.jobId)
    res.json({ ok: true, path: dest })
  })
})

// ─── Upload ───────────────────────────────────────────────────────────────────

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(500).json({ error: 'Error al recibir archivo: ' + err.message })
    next()
  })
}, async (req, res) => {
  const { channel_id, path: filePath = '/', job_id: jobId } = req.body
  if (!channel_id || !req.file) return res.status(400).json({ error: 'channel_id y file requeridos' })

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id)
  if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })

  const client = await getClient()
  const originalName = req.file.originalname || 'file'
  const namedPath = path.join(UPLOAD_TMP, Date.now() + '_' + originalName)
  fs.renameSync(req.file.path, namedPath)

  try {
    const entity = await getChannelEntity(channel.tg_id, channel.access_hash)
    const normalPath = filePath.replace(/\/?$/, '/').replace(/^([^/])/, '/$1')
    const { guessType } = await import('./telegram.js')
    const fileSize = fs.statSync(namedPath).size

    function makeProgressCb(partNum, partTotal, partSize) {
      let lastBytes = 0, lastTime = Date.now()
      return (frac) => {
        const now = Date.now()
        const currentBytes = Math.floor(frac * partSize)
        const dt = (now - lastTime) / 1000
        const speed = dt > 0.1 ? (currentBytes - lastBytes) / dt : 0
        lastBytes = currentBytes; lastTime = now
        setJob(jobId, { status: 'uploading', progress: Math.floor(frac * 100), speed: Math.max(0, speed), part: partNum, partTotal, name: originalName })
      }
    }

    if (fileSize > CHUNK_SIZE) {
      const partTotal = Math.ceil(fileSize / CHUNK_SIZE)
      const groupId = crypto.randomUUID()
      setJob(jobId, { status: 'uploading', progress: 0, speed: 0, part: 1, partTotal, name: originalName })
      console.log(`[upload] archivo grande (${fileSize} bytes), dividiendo en ${partTotal} partes`)

      for (let i = 0; i < partTotal; i++) {
        const partNum = i + 1
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, fileSize) - 1
        const partSize = end - start + 1
        const partPath = path.join(UPLOAD_TMP, `${groupId}_p${partNum}`)

        await writeChunk(namedPath, partPath, start, end)
        const caption = `path: ${normalPath}\npart: ${partNum}/${partTotal}\ngroup: ${groupId}\nname: ${originalName}`
        const result = await client.sendFile(entity, { file: partPath, caption, forceDocument: true, workers: 4, progressCallback: makeProgressCb(partNum, partTotal, partSize) })
        fs.unlinkSync(partPath)

        const doc = result.media && result.media.document
        const mimeType = (doc && doc.mimeType) || 'application/octet-stream'
        db.prepare(`INSERT OR IGNORE INTO files (channel_id, file_id, message_id, name, path, size, mime_type, type, date, part_group, part_num, part_total, part_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run([channel.id, doc ? String(doc.id) : String(result.id), result.id, `${originalName}.part${partNum}`, normalPath, partSize, mimeType, guessType(mimeType, originalName), new Date().toISOString(), groupId, partNum, partTotal, originalName])
        console.log(`[upload] parte ${partNum}/${partTotal} subida`)
      }

      fs.unlinkSync(namedPath)
      setJob(jobId, { status: 'done', progress: 100 })
      pushManifest(parseInt(channel_id)).catch(e => console.error('[sync] push error:', e.message))
      res.json({ ok: true, parts: partTotal, multipart: true })

    } else {
      setJob(jobId, { status: 'uploading', progress: 0, speed: 0, part: 1, partTotal: 1, name: originalName })
      const result = await client.sendFile(entity, { file: namedPath, caption: `path: ${normalPath}`, forceDocument: true, workers: 4, progressCallback: makeProgressCb(1, 1, fileSize) })
      fs.unlinkSync(namedPath)

      const doc = result.media && result.media.document
      const mimeType = (doc && doc.mimeType) || req.file.mimetype || null
      db.prepare(`INSERT OR IGNORE INTO files (channel_id, file_id, message_id, name, path, size, mime_type, type, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run([channel.id, doc ? String(doc.id) : String(result.id), result.id, originalName, normalPath, doc && doc.size ? Number(doc.size) : req.file.size || null, mimeType, guessType(mimeType, originalName), new Date().toISOString()])

      setJob(jobId, { status: 'done', progress: 100 })
      pushManifest(parseInt(channel_id)).catch(e => console.error('[sync] push error:', e.message))
      res.json({ ok: true, message_id: result.id })
    }
  } catch (err) {
    console.error('[upload] Error:', err)
    setJob(jobId, { status: 'error', error: err.message })
    if (fs.existsSync(namedPath)) fs.unlinkSync(namedPath)
    res.status(500).json({ error: err.message })
  }
})

// ─── Carpetas ─────────────────────────────────────────────────────────────────

router.get('/folders', (req, res) => {
  const { channel_id, path: parentPath = '/' } = req.query
  if (!channel_id) return res.json([])
  const parent = parentPath.replace(/\/?$/, '/').replace(/^([^/])/, '/$1')
  const folders = db.prepare('SELECT * FROM folders WHERE channel_id = ? ORDER BY full_path').all(channel_id).filter(f => {
    const parts = f.full_path.replace(/^\//, '').replace(/\/$/, '').split('/')
    const folderParent = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/') + '/'
    return folderParent === parent
  })
  res.json(folders)
})

router.patch('/folders/rename', (req, res) => {
  const { channel_id, old_path, new_name } = req.body
  if (!channel_id || !old_path || !new_name) return res.status(400).json({ error: 'channel_id, old_path y new_name requeridos' })
  const oldFull = old_path.endsWith('/') ? old_path : old_path + '/'
  const parts = oldFull.replace(/\/$/, '').split('/')
  parts[parts.length - 1] = new_name.replace(/[/\\]/g, '-').trim()
  const newFull = parts.join('/') + '/'
  const parentPrefix = parts.slice(0, -1).join('/') + '/'

  // Renombrar carpeta y todas las subcarpetas
  const folders = db.prepare("SELECT * FROM folders WHERE channel_id = ? AND (full_path = ? OR full_path LIKE ?)").all([channel_id, oldFull, oldFull + '%'])
  for (const f of folders) {
    const updated = f.full_path.replace(oldFull, newFull)
    db.prepare('UPDATE folders SET full_path = ? WHERE id = ?').run([updated, f.id])
  }
  // Renombrar path de archivos
  const files = db.prepare("SELECT * FROM files WHERE channel_id = ? AND (path = ? OR path LIKE ?)").all([channel_id, oldFull, oldFull + '%'])
  for (const f of files) {
    const updated = f.path.replace(oldFull, newFull)
    db.prepare('UPDATE files SET path = ? WHERE id = ?').run([updated, f.id])
  }
  pushManifest(parseInt(channel_id)).catch(e => console.error('[sync] push error:', e.message))
  res.json({ ok: true, new_path: newFull })
})

router.post('/folders', (req, res) => {
  const { channel_id, path: parentPath = '/', name } = req.body
  if (!channel_id || !name) return res.status(400).json({ error: 'channel_id y name requeridos' })
  const parent = parentPath.replace(/\/?$/, '/').replace(/^([^/])/, '/$1')
  const safeName = name.replace(/[/\\]/g, '-').trim()
  const fullPath = parent === '/' ? '/' + safeName + '/' : parent + safeName + '/'
  try {
    const result = db.prepare('INSERT OR IGNORE INTO folders (channel_id, full_path) VALUES (?, ?)').run([channel_id, fullPath])
    pushManifest(parseInt(channel_id)).catch(e => console.error('[sync] push error:', e.message))
    res.json({ id: result.lastInsertRowid, channel_id: parseInt(channel_id), full_path: fullPath })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/folders/:id', async (req, res) => {
  // Acepta id numérico o "bypath" con query ?channel_id=&path=
  const { channel_id, path: folderPath } = req.query
  let channelId, fullPath

  if (req.params.id === 'bypath') {
    if (!channel_id || !folderPath) return res.status(400).json({ error: 'channel_id y path requeridos' })
    channelId = parseInt(channel_id)
    fullPath = folderPath.endsWith('/') ? folderPath : folderPath + '/'
  } else {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id)
    if (!folder) return res.status(404).json({ error: 'Carpeta no encontrada' })
    channelId = folder.channel_id
    fullPath = folder.full_path.endsWith('/') ? folder.full_path : folder.full_path + '/'
  }

  // Obtener todos los archivos antes de borrarlos
  const filesToDelete = db.prepare("SELECT * FROM files WHERE channel_id = ? AND (path = ? OR path LIKE ?)").all([channelId, fullPath, fullPath + '%'])
  const messageIds = [...new Set(filesToDelete.map(f => f.message_id).filter(Boolean))]

  // Borrar mensajes en Telegram
  if (messageIds.length) {
    getClient().then(async client => {
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId)
      const entity = await getChannelEntity(channel.tg_id, channel.access_hash)
      await client.deleteMessages(entity, messageIds, { revoke: true })
    }).catch(err => console.error('[delete folder] Error Telegram:', err.message))
  }

  // Borrar del índice local
  db.prepare("DELETE FROM folders WHERE channel_id = ? AND (full_path = ? OR full_path LIKE ?)").run([channelId, fullPath, fullPath + '%'])
  db.prepare("DELETE FROM files WHERE channel_id = ? AND (path = ? OR path LIKE ?)").run([channelId, fullPath, fullPath + '%'])
  try { await pushManifestNow(channelId) } catch (e) { console.error('[sync] push error:', e.message) }
  res.json({ ok: true })
})

// ─── Preferencias ────────────────────────────────────────────────────────────

router.get('/prefs', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM prefs').all()
  const prefs = {}
  rows.forEach(r => { try { prefs[r.key] = JSON.parse(r.value) } catch { prefs[r.key] = r.value } })
  res.json(prefs)
})

router.patch('/prefs', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    db.prepare('INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)').run([key, JSON.stringify(value)])
  }
  res.json({ ok: true })
})

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT COUNT(DISTINCT c.id) as channels, COUNT(f.id) as files, SUM(f.size) as total_size
    FROM channels c LEFT JOIN files f ON f.channel_id = c.id
  `).get()
  const byType = db.prepare(`SELECT type, COUNT(*) as count FROM files GROUP BY type ORDER BY count DESC`).all()
  res.json({ ...stats, by_type: byType })
})

export { router, startLiveIndexer }
