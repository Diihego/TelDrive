import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Cargar .env — primero AppData (Electron), luego backend/, luego raíz
const dataDir = process.env.TELDRIVE_DATA_DIR
if (dataDir) config({ path: path.join(dataDir, '.env') })
config({ path: path.join(__dirname, '../.env') })
config({ path: path.join(__dirname, '../../.env') })

import express from 'express'
import cors from 'cors'
import { router, startLiveIndexer } from './routes.js'
import { getClient } from './telegram.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: (origin, cb) => cb(null, true), // acepta file:// y localhost
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}))
app.use(express.json())
app.use('/api', router)

app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }))

// Servir frontend buildado en producción (Electron)
const frontendDist = path.join(__dirname, '../../frontend/dist')
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'))
    }
  })
}

async function main() {
  console.log('TelDrive backend arrancando...')
  const { isConfigured } = await import('./setup.js')
  if (isConfigured()) {
    await getClient()
    await startLiveIndexer()
  } else {
    console.log('TelDrive: esperando configuración inicial...')
  }
  const server = app.listen(PORT, () => {
    console.log(`API corriendo en http://localhost:${PORT}`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Puerto ${PORT} ya en uso — asumiendo que el backend ya está corriendo`)
    } else {
      console.error('Error del servidor:', err)
    }
  })

  server.timeout = 0
  server.keepAliveTimeout = 0
  server.headersTimeout = 0
}

main().catch(err => {
  console.error('Error fatal:', err)
  // Solo salir si no estamos dentro de Electron
  if (!process.versions.electron) process.exit(1)
})
