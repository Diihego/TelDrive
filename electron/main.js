import { app, BrowserWindow, Tray, Menu, nativeImage, shell, MenuItem, dialog, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const isDev = !app.isPackaged
const PORT = 3001

let mainWindow = null
let tray = null
let backendStarted = false

// ─── Iniciar backend Express ──────────────────────────────────────────────────

async function startBackend() {
  if (backendStarted) return
  backendStarted = true
  try {
    // Directorio de datos del usuario (AppData\Roaming\TelDrive en Windows)
    const userDataPath = app.getPath('userData')
    process.env.TELDRIVE_DATA_DIR = userDataPath
    console.log('[electron] Datos en:', userDataPath)

    const backendPath = isDev
      ? path.join(__dirname, '../backend/src/index.js')
      : path.join(process.resourcesPath, 'backend/src/index.js')

    await import(pathToFileURL(backendPath).href)
    console.log('[electron] Backend iniciado en puerto', PORT)
  } catch (err) {
    console.error('[electron] Error al iniciar backend:', err)
    dialog.showErrorBox('Error al iniciar backend', err.message + '\n\n' + (err.stack || ''))
  }
}

// ─── Esperar a que el backend responda ────────────────────────────────────────

function waitForBackend(retries = 20) {
  return new Promise((resolve, reject) => {
    const http = require('http')
    let attempts = 0
    const check = () => {
      attempts++
      const req = http.get(`http://localhost:${PORT}/health`, res => {
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.end()
    }
    const retry = () => {
      if (attempts >= retries) return reject(new Error('Backend no responde'))
      setTimeout(check, 500)
    }
    check()
  })
}

// ─── Crear ventana principal ──────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'TelDrive',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // mostrar cuando esté listo
  })

  // Cargar el frontend como archivo local (evita restricciones de seguridad de Electron)
  const distPath = isDev
    ? path.join(__dirname, '../frontend/dist/index.html')
    : path.join(process.resourcesPath, 'frontend/dist/index.html')

  mainWindow.loadFile(distPath)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev || process.argv.includes('--devtools')) {
      mainWindow.webContents.openDevTools()
    }
  })

  // Minimizar a tray en vez de cerrar
  mainWindow.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  // Abrir links externos en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)

  const menu = Menu.buildFromTemplate([
    {
      label: 'Mostrar TelDrive',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setToolTip('TelDrive')
  tray.setContextMenu(menu)
  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

// Quitar la barra de menú (File, Edit, View...)
Menu.setApplicationMenu(null)

// ─── Auto-updater ─────────────────────────────────────────────────────────────

async function setupUpdater() {
  if (isDev) return
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', info => {
    mainWindow?.webContents.send('update-status', { status: 'downloading', version: info.version })
  })

  autoUpdater.on('update-downloaded', info => {
    mainWindow?.webContents.send('update-status', { status: 'ready', version: info.version })
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: `TelDrive ${info.version} está listo para instalar.`,
      detail: 'La app se reiniciará para aplicar la actualización.',
      buttons: ['Instalar ahora', 'Más tarde'],
      defaultId: 0,
    })
    if (choice === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', err => {
    console.error('[updater] Error:', err.message)
  })

  // Verificar al iniciar y cada 1 hora
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000)
}

app.whenReady().then(async () => {
  await startBackend()

  try {
    await waitForBackend()
  } catch (err) {
    console.error('[electron] Backend no disponible:', err.message)
  }

  createWindow()
  createTray()
  setupUpdater()
})

app.on('window-all-closed', e => {
  // No salir al cerrar la ventana — queda en tray
  e.preventDefault()
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
})
