import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import input from 'input'
import { loadConfig } from './setup.js'

let client = null

export function resetClient() { client = null }

export async function getClient() {
  // Si el cliente existe pero se desconectó, intentar reconectar primero
  if (client) {
    if (client.connected) return client
    try {
      console.log('[TG] Reconectando cliente...')
      await client.connect()
      if (client.connected) {
        console.log('[TG] Reconectado.')
        return client
      }
    } catch (e) {
      console.warn('[TG] Fallo reconexión, creando nuevo cliente:', e.message)
    }
    client = null
  }

  const cfg = loadConfig()
  const useEnv = !process.env.TELDRIVE_DATA_DIR // en Electron, solo config.json
  const apiId = parseInt(cfg.apiId || (useEnv ? process.env.TG_API_ID : ''))
  const apiHash = cfg.apiHash || (useEnv ? process.env.TG_API_HASH : '')
  const sessionStr = cfg.session || (useEnv ? process.env.TG_SESSION : '') || ''

  const session = new StringSession(sessionStr)
  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 10,
    retryDelay: 1000,
    timeout: 120,
    requestRetries: 5,
  })

  await client.start({
    phoneNumber: async () => await input.text('Numero de telefono (+549...): '),
    password:    async () => await input.text('Contrasena 2FA (si tenes): '),
    phoneCode:   async () => await input.text('Codigo recibido: '),
    onError: (err) => console.error('[TG]', err),
  })

  console.log('Sesion Telegram activa:', client.session.save())
  console.log('Copia el string de sesion a TG_SESSION en tu .env\n')
  return client
}

function channelCandidates(idStr) {
  const asNumber = parseInt(idStr)
  if (isNaN(asNumber)) return [idStr]
  const abs = Math.abs(asNumber)
  return [
    { channelId: BigInt(abs), _: 'PeerChannel' },
    asNumber < 0 ? asNumber : -asNumber,
    idStr,
  ]
}

export async function resolveChannel(usernameOrId) {
  const c = await getClient()
  const candidates = channelCandidates(String(usernameOrId))
  for (const candidate of candidates) {
    try {
      const entity = await c.getEntity(candidate)
      if (entity) return entity
    } catch (_) {}
  }
  return null
}

export async function getChannelEntity(tgId, accessHash) {
  const c = await getClient()

  // Si tenemos access_hash podemos construir un InputChannel directo (sin cache)
  if (accessHash) {
    try {
      const { Api } = await import('telegram')
      const input = new Api.InputChannel({
        channelId: BigInt(Math.abs(parseInt(tgId))),
        accessHash: BigInt(accessHash),
      })
      const entity = await c.getEntity(input)
      if (entity) return entity
    } catch (_) {}
  }

  const candidates = channelCandidates(String(tgId))
  for (const candidate of candidates) {
    try {
      const entity = await c.getEntity(candidate)
      if (entity) return entity
    } catch (_) {}
  }
  throw new Error('No se pudo resolver el canal con tg_id=' + tgId)
}

export function extractPath(message) {
  const caption = message.message || ''
  const match = caption.match(/path:\s*([^\n\r]+)/i)
  if (match) return match[1].trim().replace(/\/?$/, '/').replace(/^([^/])/, '/$1')
  return '/'
}

export function guessType(mimeType, name) {
  if (!mimeType && !name) return 'other'
  const ext = (name || '').split('.').pop().toLowerCase()
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext) || (mimeType||'').startsWith('image/')) return 'image'
  if (['mp4','mov','avi','mkv','webm'].includes(ext) || (mimeType||'').startsWith('video/')) return 'video'
  if (['mp3','ogg','wav','flac','m4a'].includes(ext) || (mimeType||'').startsWith('audio/')) return 'audio'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archive'
  if (['psd','psb','ai','xd','sketch','fig'].includes(ext)) return 'design'
  if (['ztl','zbp','zmt'].includes(ext)) return 'ztl'
  if (['zpr'].includes(ext)) return 'zpr'
  if (['stl','obj','fbx','gltf','glb','3mf','ply','dae','blend','ma','mb','c4d','max'].includes(ext)) return '3d'
  if (['js','ts','py','go','rs','java','cpp','c','html','css','json','yaml','toml','sh'].includes(ext)) return 'code'
  if (['doc','docx','xls','xlsx','ppt','pptx','txt','md'].includes(ext)) return 'document'
  return 'other'
}
