import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import fs from 'fs'
import path from 'path'
import { resetClient, getClient } from './telegram.js'
import { startLiveIndexer } from './indexer.js'

async function initTelegramAfterSetup() {
  try {
    await getClient()
    await startLiveIndexer()
    console.log('[setup] Telegram iniciado correctamente')
  } catch (err) {
    console.error('[setup] Error al iniciar Telegram:', err.message)
  }
}

const dataDir = process.env.TELDRIVE_DATA_DIR || '.'
const CONFIG_PATH = path.join(dataDir, 'teldrive.config.json')

export function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return {} }
  }
  return {}
}

export function saveConfig(data) {
  const current = loadConfig()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...data }, null, 2))
}

export function isConfigured() {
  const cfg = loadConfig()
  if (cfg.apiId && cfg.apiHash && cfg.session) return true
  // En modo Electron (TELDRIVE_DATA_DIR), solo config.json es válido — ignorar .env
  if (process.env.TELDRIVE_DATA_DIR) return false
  // En modo dev/standalone, aceptar .env
  if (process.env.TG_API_ID && process.env.TG_API_HASH && process.env.TG_SESSION) return true
  return false
}

// Estado en memoria del flujo de setup
let setupClient = null
let setupState = { stage: 'idle' } // idle → credentials → phone → code → done

export function getSetupState() { return setupState }

export async function initSetup(apiId, apiHash) {
  setupState = { stage: 'phone', apiId, apiHash }
  setupClient = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, {
    connectionRetries: 3,
  })
  await setupClient.connect()
  return { ok: true }
}

export async function sendCode(phone) {
  if (!setupClient) throw new Error('Primero configurá las credenciales')
  const result = await setupClient.sendCode(
    { apiId: parseInt(setupState.apiId), apiHash: setupState.apiHash },
    phone
  )
  setupState = { ...setupState, stage: 'code', phone, phoneCodeHash: result.phoneCodeHash }
  return { ok: true }
}

export async function signIn(code) {
  if (!setupClient) throw new Error('Sesión de setup no iniciada')
  try {
    await setupClient.invoke(
      new (await import('telegram')).Api.auth.SignIn({
        phoneNumber: setupState.phone,
        phoneCodeHash: setupState.phoneCodeHash,
        phoneCode: code.trim(),
      })
    )
    const session = setupClient.session.save()
    saveConfig({ apiId: setupState.apiId, apiHash: setupState.apiHash, session })
    setupState = { stage: 'done' }
    resetClient()
    await initTelegramAfterSetup()
    return { ok: true, need2fa: false }
  } catch (err) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      setupState = { ...setupState, stage: '2fa' }
      return { ok: true, need2fa: true }
    }
    throw err
  }
}

export async function verify2fa(password) {
  if (!setupClient) throw new Error('Sesión de setup no iniciada')
  const { Api } = await import('telegram')
  const pwdInfo = await setupClient.invoke(new Api.account.GetPassword())
  const { computeCheck } = await import('telegram/Password.js')
  const pwdCheck = await computeCheck(pwdInfo, password)
  await setupClient.invoke(new Api.auth.CheckPassword({ password: pwdCheck }))
  const session = setupClient.session.save()
  saveConfig({ apiId: setupState.apiId, apiHash: setupState.apiHash, session })
  setupState = { stage: 'done' }
  resetClient()
  await initTelegramAfterSetup()
  return { ok: true }
}
