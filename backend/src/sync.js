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

/**
 * Sube el indice actual como JSON y elimina los manifests anteriores.
 */
export async function pushManifest(channelId) {
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

  // Eliminar los manifests anteriores (revocar para todos los miembros)
  if (oldIds.length > 0) {
    try {
      await client.deleteMessages(entity, oldIds, { revoke: true })
      console.log('[sync] ' + oldIds.length + ' manifest(s) anterior(es) eliminado(s)')
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

  // Sincronizar archivos
  let imported = 0
  const insertFile = db.prepare(`
    INSERT OR IGNORE INTO files (channel_id, file_id, message_id, name, path, size, mime_type, type, date, part_group, part_num, part_total, part_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const f of manifest.files || []) {
    const result = insertFile.run([
      channelId, f.file_id, f.message_id, f.name,
      f.path, f.size, f.mime_type, f.type, f.date,
      f.part_group || null, f.part_num || null, f.part_total || null, f.part_name || null,
    ])
    if (result.changes > 0) imported++
  }

  // Sincronizar carpetas
  let foldersImported = 0
  const insertFolder = db.prepare(
    'INSERT OR IGNORE INTO folders (channel_id, full_path) VALUES (?, ?)'
  )
  for (const folder of manifest.folders || []) {
    const result = insertFolder.run([channelId, folder.full_path])
    if (result.changes > 0) foldersImported++
  }

  console.log('[sync] pull: ' + imported + ' archivos nuevos, ' + foldersImported + ' carpetas nuevas')
  return {
    files: (manifest.files || []).length,
    folders: (manifest.folders || []).length,
    imported,
    foldersImported,
    updated: manifest.updated,
  }
}
