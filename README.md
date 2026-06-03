# TelDrive 📡

App de escritorio para Windows que usa canales de Telegram como almacenamiento personal.  
Todo corre local — sin servidores externos, sin suscripciones.

---

## Qué es

TelDrive te permite usar cualquier canal o grupo de Telegram como si fuera una carpeta en la nube. Subís archivos desde la app, los organizás en carpetas, y los descargás cuando los necesitás. La app indexa los archivos existentes en el canal y los muestra en una interfaz tipo drive.

---

## Instalación

1. Bajá el instalador desde [Releases](../../releases/latest)
2. Ejecutá el `.exe` y seguí los pasos
3. Al abrir la app por primera vez, ingresá tus credenciales de Telegram

---

## Primeros pasos

### 1. Obtener credenciales de Telegram

1. Entrá a https://my.telegram.org/apps
2. Creá una nueva aplicación
3. Copiá el `api_id` y el `api_hash`

### 2. Configurar la app

Al abrir TelDrive por primera vez te va a pedir:
- `api_id` y `api_hash` (del paso anterior)
- Tu número de teléfono
- El código que llega a Telegram
- Contraseña 2FA (si la tenés activa)

### 3. Agregar un canal

Hacé click en **Agregar canal** e ingresá el `@username` o ID del canal/grupo.  
Tenés que ser miembro del canal. Después usá el botón **Re-indexar** (🔄) para escanear los archivos existentes.

---

## Funcionalidades

- **Múltiples canales** — administrá varios canales desde la misma app
- **Árbol de carpetas** — organizá archivos en carpetas y subcarpetas
- **Subida de archivos y carpetas** — arrastrá directo a la interfaz o usá el botón Subir
- **Descarga directa** — los archivos se descargan desde Telegram a tu PC
- **Búsqueda** — buscá archivos por nombre en todos los canales
- **Iconos por tipo** — cada formato tiene su icono (🎬 video, 🖼 imagen, 💀 ZTL, 🗿 ZPR, 🧊 STL, etc.)
- **Actualizaciones automáticas** — la app se actualiza sola cuando hay una versión nueva

---

## Subir archivos desde Telegram

También podés subir archivos directamente desde Telegram con este caption:

```
path: /carpeta/subcarpeta/
```

La app lo detecta automáticamente y lo indexa.

---

## Estructura del proyecto

```
teldrive/
├── electron/
│   └── main.js          # Proceso principal Electron + auto-updater
├── backend/
│   └── src/
│       ├── index.js     # Servidor Express
│       ├── db.js        # SQLite schema
│       ├── telegram.js  # Cliente MTProto
│       ├── indexer.js   # Escáner de canales
│       └── routes.js    # API REST
└── frontend/
    └── src/
        ├── App.jsx      # Interfaz completa
        └── lib/
            ├── api.js   # Cliente HTTP
            └── utils.js # Helpers e iconos por tipo
```

---

## Desarrollo

```bash
# Instalar dependencias
npm run install:all

# Correr en modo desarrollo
npm run electron:dev

# Compilar instalador
npm run build
```

---

## Límites de Telegram

- Tamaño máximo por archivo: **2 GB** (cuenta Premium: **4 GB**)
- Sin límite de almacenamiento total
