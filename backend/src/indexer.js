import { getClient, getChannelEntity, extractPath, guessType } from './telegram.js'
import db from './db.js'

const INSERT_FILE_SQL = `
  INSERT OR REPLACE INTO files (channel_id, file_id, message_id, name, path, size, mime_type, type, date, part_group, part_num, part_total, part_name)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

function extractPartMeta(caption) {
  if (!caption) return {}
  const partMatch = caption.match(/^part:\s*(\d+)\/(\d+)/m)
  const groupMatch = caption.match(/^group:\s*(\S+)/m)
  const nameMatch = caption.match(/^name:\s*(.+)/m)
  if (!partMatch) return {}
  return {
    part_num:   parseInt(partMatch[1]),
    part_total: parseInt(partMatch[2]),
    part_group: groupMatch ? groupMatch[1].trim() : null,
    part_name:  nameMatch ? nameMatch[1].trim() : null,
  }
}

function findChannelByPeerId(peerId) {
  const raw = String(peerId)
  const withPrefix = raw.startsWith('-') ? raw : `-100${raw}`
  const withoutPrefix = raw.replace(/^-100/, '')

  return (
    db.prepare('SELECT * FROM channels WHERE tg_id = ?').get(raw) ||
    db.prepare('SELECT * FROM channels WHERE tg_id = ?').get(withPrefix) ||
    db.prepare('SELECT * FROM channels WHERE tg_id = ?').get(withoutPrefix)
  )
}

function buildFileRow(channelId, msg, doc) {
  const attr = doc.attributes && doc.attributes.find(a => a.fileName) || {}
  const name = attr.fileName || `file_${msg.id}`
  const mimeType = doc.mimeType || null
  const size = doc.size ? Number(doc.size) : null
  const filePath = extractPath(msg)
  const type = guessType(mimeType, name)
  const caption = msg.message || ''
  const { part_num, part_total, part_group, part_name } = extractPartMeta(caption)
  // Si es parte de un archivo multipart, detectar tipo del nombre original
  const typeFromName = part_name ? guessType(mimeType, part_name) : type

  return [
    channelId,
    String(doc.id),
    msg.id,
    name,
    filePath,
    size,
    mimeType,
    typeFromName,
    msg.date ? new Date(msg.date * 1000).toISOString() : null,
    part_group || null,
    part_num || null,
    part_total || null,
    part_name || null,
  ]
}

export async function indexChannel(channelId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId)
  if (!channel) throw new Error('Canal no encontrado')

  const client = await getClient()
  const entity = await getChannelEntity(channel.tg_id, channel.access_hash)

  let indexed = 0
  let skipped = 0
  let offsetId = 0
  const BATCH = 100

  const insertFile = db.prepare(INSERT_FILE_SQL)

  while (true) {
    const messages = await client.getMessages(entity, {
      limit: BATCH,
      offsetId,
    })

    if (!messages.length) break

    const insertBatch = db.transaction((msgs) => {
      for (const msg of msgs) {
        if (!msg.media) continue
        const doc = msg.media.document || msg.media.photo
        if (!doc) continue

        const result = insertFile.run(buildFileRow(channel.id, msg, doc))
        if (result.changes > 0) indexed++
        else skipped++
      }
    })

    insertBatch(messages)
    offsetId = messages[messages.length - 1].id

    console.log(`[indexer] canal=${channel.name} batch=${messages.length} indexed=${indexed}`)

    if (messages.length < BATCH) break
  }

  return { indexed, skipped }
}

export async function startLiveIndexer() {
  const client = await getClient()
  const { NewMessage } = await import('telegram/events/index.js')

  const insertFile = db.prepare(INSERT_FILE_SQL)

  client.addEventHandler(async (event) => {
    const msg = event.message
    if (!msg || !msg.media) return

    const doc = msg.media.document || msg.media.photo
    if (!doc) return

    const peerId = msg.peerId && (msg.peerId.channelId || msg.peerId.chatId)
    if (!peerId) return

    const channel = findChannelByPeerId(peerId)
    if (!channel) return

    const result = insertFile.run(buildFileRow(channel.id, msg, doc))
    if (result.changes > 0) {
      const attr = doc.attributes && doc.attributes.find(a => a.fileName)
      const name = (attr && attr.fileName) || `file_${msg.id}`
      const filePath = extractPath(msg)
      console.log(`[live] nuevo archivo: ${name} en ${channel.name}${filePath}`)
    }
  }, new NewMessage({}))

  console.log('[live] Live indexer activo - escuchando nuevos archivos...')
}
