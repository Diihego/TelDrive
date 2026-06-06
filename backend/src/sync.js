import { getClient, getChannelEntity } from './telegram.js'
import db from './db.js'
import os from 'os'
import path from 'path'
import fs from 'fs'

const MANIFEST_CAPTION = '#teldrive_index'
const TMP = path.join(os.tmpdir(), 'teldrive-sync')
fs.mkdirSync(TMP, { recursive: true })

/**
 * Busca todos los mensajes de manifest en el canal y devuelve sus IDs.
 */
async function findManifestMessages(client, entity) {
  const ids = []
  let offsetId = 0
  const BATCH = 100

  while (true) {
    const messages = await client.getMessages(entity, { limit: BATCH, offsetId })
    if (!messages.length) break

    for (const msg of messages) {
      if (msg.message && msg.message.includes(MANIFEST_CAPTION) && msg.media) {
        ids.push(msg.id)
      }
    }

    offsetId = messages[messages.length - 1].id
    if (messages.length < BATCH) break
  }

  return ids
}

// Debounce por canal — evita subir múltiples manifests cuando hay ráfagas de operaciones
const pushTimers = new Map()
const pushRunning = new Map()

export function pushManifest(channelId) {
  return new Promise((resolve, reject) => {
    // Cancelar timer anterior si existe
    if (pushTimers.has(channelId)) {
      clearTimeout(pushTimers.get(channelId))
    }
    // Esperar 2s de inactividad antes de ejecutar
    const timer = setTimeout(async () => {
      pushTimers.delete(channelId)
      // Si ya hay uno corriendo para este canal, esperar a que termine
      if (pushRunning.get(channelId)) {
        try { await pushRunning.get(channelId) } catch (_) {}
      }
      const run = _pushManifest(channelId)
      pushRunning.set(channelId, run)
      run.then(resolve).catch(reject).finally(() => pushRunning.delete(channelId))
    }, 2000)
    pushTimers.set(channelId, timer)
  })
}

/**
 * Push inmediato sin debounce — usar para borrados críticos.
 */
export async function pushManifestNow(channelId) {
  // Cancelar cualquier debounce pendiente para este canal
  if (pushTimers.has(channelId)) {
    clearTimeout(pushTimers.get(channelId))
    pushTimers.delete(channelId)
  }
  // Si ya hay uno corriendo, esperar a que termine
  if (pushRunning.get(channelId)) {
    try { await pushRunning.get(channelId) } catch (_) {}
  }
  const run = _pushManifest(channelId)
  pushRunning.set(channelId, run)
  return run.finally(() => pushRunning.delete(channelId))
}

/**
 * Sube el indice actual como JSON y elimina los manifests anteriores.
 */
async function _pushManifest(channelId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId)
  if (!channel) throw new Error('Canal no encontrado')

  const files = db.prepare('SELECT * FROM files WHERE channel_id = ?').all(channelId)
  const folders = db.prepare('SELECT * FROM folders WHERE channel_id = ?').all(channelId)

  const manifest = {
    version: 1,
    channel_tg_id: channel.tg_id,
    updated: new Date().toISOString(),
    files: files.map(f => ({
      file_id:    f.file_id,
      message_id: f.message_id,
      name:       f.name,
      path:       f.path,
      size:       f.size,
      mime_type:  f.mime_type,
      type:       f.type,
      date:       f.date,
      part_group: f.part_group || null,
      part_num:   f.part_num || null,
      part_total: f.part_total || null,
      part_name:  f.part_name || null,
    })),
    folders: folders.map(f => ({ full_path: f.full_path })),
  }

  const json = JSON.stringify(manifest, null, 2)
  const tmpFile = path.join(TMP, 'manifest_' + channelId + '_' + Date.now() + '.json')
  fs.writeFileSync(tmpFile, json)

  const client = await getClient()
  const entity = await getChannelEntity(channel.tg_id, channel.access_hash)

  // Encontrar manifests existentes ANTES de subir el nuevo
  const oldIds = await findManifestMessages(client, entity)

  try {
    // Subir el nuevo manifest
    await client.sendFile(entity, {
      file: tmpFile,
      caption: MANIFEST_CAPTION,
      forceDocument: true,
    })
    console.log('[sync] manifest subido para canal ' + channel.name + ' (' + files.length + ' archivos, ' + folders.length + ' carpetas)')
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }

  // Buscar TODOS los manifests después de subir — incluye el nuevo y cualquier duplicado acumulado
  // Ordenar desc por ID, conservar el más nuevo, borrar el resto
  const allIds = await findManifestMessages(client, entity).catch(() => oldIds)
  const sorted = [...allIds].sort((a, b) => b - a) // mayor ID = más nuevo
  const toDelete = sorted.slice(1) // conservar el primero (más nuevo), borrar el resto

  if (toDelete.length > 0) {
    try {
      await client.deleteMessages(entity, toDelete, { revoke: true })
      console.log('[sync] ' + toDelete.length + ' manifest(s) duplicado(s) eliminado(s)')
    } catch (e) {
      console.warn('[sync] no se pudo eliminar manifests anteriores:', e.message)
    }
  }
}

/**
 * Descarga el manifest mas reciente del canal y sincroniza la DB local.
 */
export async function pullManifest(channelId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId)
  if (!channel) throw new Error('Canal no encontrado')

  const client = await getClient()
  const entity = await getChannelEntity(channel.tg_id, channel.access_hash)

  // Buscar el mensaje mas reciente con caption #teldrive_index
  let manifestMsg = null
  let offsetId = 0
  const BATCH = 100

  while (true) {
    const messages = await client.getMessages(entity, { limit: BATCH, offsetId })
    if (!messages.length) break

    for (const msg of messages) {
      if (msg.message && msg.message.includes(MANIFEST_CAPTION) && msg.media) {
        manifestMsg = msg
        break
      }
    }

    if (manifestMsg) break
    offsetId = messages[messages.length - 1].id
    if (messages.length < BATCH) break
  }

  if (!manifestMsg) {
    console.log('[sync] no hay manifest en canal ' + channel.name + ', verificando permisos...')

    // Solo hacer push si el usuario es creador o admin con permiso de envío
    const canPost = entity.creator === true ||
      (entity.adminRights && entity.adminRights.postMessages)

    if (canPost) {
      console.log('[sync] canal propio detectado, generando manifest inicial...')
      await pushManifest(channelId)
      return { files: 0, folders: 0, imported: 0, foldersImported: 0, created: true }
    }

    console.log('[sync] canal ajeno, no se genera manifest')
    return null
  }

  // Descargar el JSON
  const buffer = await client.downloadMedia(manifestMsg, {})
  const json = Buffer.from(buffer).toString('utf8')
  let manifest
  try {
    manifest = JSON.parse(json)
  } catch (e) {
    console.error('[sync] manifest JSON invalido:', e.message)
    return null
  }

  // Sync inteligente: preserva IDs existentes, solo toca lo que cambió
  const existingFiles = db.prepare('SELECT id, file_id, message_id, alias FROM files WHERE channel_id = ?').all(channelId)
  const existingByFileId = new Map(existingFiles.map(f => [f.file_id, f]))
  const existingByMsgId = new Map(existingFiles.map(f => [f.message_id, f]))
  const manifestFileIds = new Set((manifest.files || []).map(f => f.file_id))

  // Borrar archivos que ya no están en el manifest
  for (const existing of existingFiles) {
    if (!manifestFileIds.has(existing.file_id)) {
      db.prepare('DELETE FROM files WHERE id = ?').run(existing.id)
    }
  }

  const insertFile = db.prepare(`
    INSERT OR IGNORE INTO files (channel_id, file_id, message_id, name, path, size, mime_type, type, date, part_group, part_num, part_total, part_name, alias)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateFile = db.prepare(`
    UPDATE files SET path=?, name=?, size=?, part_group=?, part_num=?, part_total=?, part_name=?
    WHERE id=?
  `)
  let imported = 0
  for (const f of manifest.files || []) {
    const existing = existingByFileId.get(f.file_id) || existingByMsgId.get(f.message_id)
    if (existing) {
      // Actualizar solo datos que pueden cambiar (path, nombre, etc.) — preservar id y alias
      updateFile.run([
        f.path, f.name, f.size,
        f.part_group || null, f.part_num || null, f.part_total || null, f.part_name || null,
        existing.id,
      ])
    } else {
      // Archivo nuevo — insertar
      const result = insertFile.run([
        channelId, f.file_id, f.message_id, f.name,
        f.path, f.size, f.mime_type, f.type, f.date,
        f.part_group || null, f.part_num || null, f.part_total || null, f.part_name || null,
        null,
      ])
      if (result.changes > 0) imported++
    }
  }

  // Sync carpetas: borrar las que no están en manifest, insertar las nuevas
  const existingFolders = db.prepare('SELECT full_path FROM folders WHERE channel_id = ?').all(channelId)
  const manifestFolderPaths = new Set((manifest.folders || []).map(f => f.full_path))
  for (const f of existingFolders) {
    if (!manifestFolderPaths.has(f.full_path)) {
      db.prepare('DELETE FROM folders WHERE channel_id = ? AND full_path = ?').run([channelId, f.full_path])
    }
  }
  const insertFolder = db.prepare('INSERT OR IGNORE INTO folders (channel_id, full_path) VALUES (?, ?)')
  let foldersImported = 0
  for (const folder of manifest.folders || []) {
    const result = insertFolder.run([channelId, folder.full_path])
    if (result.changes > 0) foldersImported++
  }

  console.log('[sync] pull: ' + imported + ' archivos, ' + foldersImported + ' carpetas')
  return {
    files: (manifest.files || []).length,
    folders: (manifest.folders || []).length,
    imported,
    foldersImported,
    updated: manifest.updated,
  }
}
