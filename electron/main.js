import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, ipcMain } from 'electron'
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

// ─── Instancia única ──────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ─── Iniciar backend Express ──────────────────────────────────────────────────

async function startBackend() {
  if (backendStarted) return
  backendStarted = true
  try {
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
  const preloadPath = isDev
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, 'preload.js')

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
      preload: preloadPath,
    },
    show: false,
  })

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

  // Al cerrar: enviar evento al renderer para mostrar modal custom
  mainWindow.on('close', e => {
    if (app.isQuitting) return
    e.preventDefault()
    mainWindow.webContents.send('close-request')
  })

  // Escuchar respuesta del renderer
  ipcMain.once('close-choice', (_, choice) => {
    if (choice === 'minimize') {
      mainWindow.hide()
      // Re-registrar el listener para la próxima vez
      mainWindow.on('close', function handler(e) {
        if (app.isQuitting) return
        e.preventDefault()
        mainWindow.removeListener('close', handler)
        mainWindow.webContents.send('close-request')
        ipcMain.once('close-choice', (_, c) => {
          if (c === 'minimize') {
            mainWindow.hide()
            mainWindow.on('close', handler)
          } else {
            app.isQuitting = true
            tray?.destroy()
            app.quit()
          }
        })
      })
    } else {
      app.isQuitting = true
      tray?.destroy()
      app.quit()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── IPC: folder picker + open path ──────────────────────────────────────────

ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Elegir carpeta de descargas',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('open-path', async (_, p) => {
  await shell.openPath(p)
})

ipcMain.handle('show-item-in-folder', (_, p) => {
  shell.showItemInFolder(p)
})

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)

  const menu = Menu.buildFromTemplate([
    {
      label: 'Mostrar TelDrive',
      click: () => { mainWindow.show(); mainWindow.focus() },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => { app.isQuitting = true; tray?.destroy(); app.quit() },
    },
  ])

  tray.setToolTip('TelDrive')
  tray.setContextMenu(menu)
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus() })
  tray.on('click', () => { mainWindow.show(); mainWindow.focus() })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

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
    if (choice === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', err => {
    console.error('[updater] Error:', err.message)
  })

  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000)
}

app.whenReady().then(async () => {
  await startBackend()
  try { await waitForBackend() } catch (err) {
    console.error('[electron] Backend no disponible:', err.message)
  }
  createWindow()
  createTray()
  setupUpdater()
})

app.on('window-all-closed', e => e.preventDefault())

app.on('activate', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus() }
})

app.on('before-quit', () => { app.isQuitting = true })
