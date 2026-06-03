import { getClient, getChannelEntity } from './telegram.js'
import db from './db.js'
import os from 'os'
import path from 'path'
import fs from 'fs'

const THUMB_DIR = path.join(os.tmpdir(), 'teldrive-thumbs')
fs.mkdirSync(THUMB_DIR, { recursive: true })

/**
 * Devuelve la ruta del thumbnail cacheado, descargandolo si no existe.
 * Retorna null si el archivo no tiene thumbnail.
 */
export async function getThumb(fileId) {
  const cachePath = path.join(THUMB_DIR, fileId + '.jpg')
  if (fs.existsSync(cachePath)) return cachePath

  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId)
  if (!file) return null
  if (!['image', 'video'].includes(file.type)) return null

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(file.channel_id)
  const client = await getClient()
  const entity = await getChannelEntity(channel.tg_id, channel.access_hash)

  const messages = await client.getMessages(entity, { ids: [file.message_id] })
  if (!messages[0] || !messages[0].media) return null

  const media = messages[0].media

  try {
    // Intentar descargar el thumbnail mas pequeno
    const buffer = await client.downloadMedia(media, { thumb: -1 })
    if (!buffer || !buffer.length) return null

    fs.writeFileSync(cachePath, Buffer.from(buffer))
    return cachePath
  } catch (e) {
    console.warn('[thumb] no se pudo obtener thumbnail para file_id=' + fileId + ':', e.message)
    return null
  }
}
