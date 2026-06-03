# TelDrive 📡

Tu drive personal usando canales de Telegram como almacenamiento.  
PWA instalable · Múltiples canales · Árbol de carpetas · Subida/descarga directa

---

## Arquitectura

```
[Canales de Telegram] → [Bot MTProto / Telethon] → [SQLite] → [API Express] → [PWA React]
```

- **Backend**: Node.js + Express + MTProto (`telegram` package) + SQLite
- **Frontend**: React + Vite + PWA (instalable como app)
- **Deploy**: Backend en Railway · Frontend en Vercel

---

## Setup en 5 pasos

### 1. Obtener credenciales de Telegram

1. Ir a https://my.telegram.org/apps
2. Crear una nueva aplicación
3. Copiar `api_id` y `api_hash`

### 2. Backend (Railway)

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales
npm install
npm run dev   # Primera vez: te va a pedir el código de Telegram
```

Al correr por primera vez te va a pedir:
- Tu número de teléfono
- El código que llega a Telegram
- Contraseña 2FA (si la tenés)

Luego te imprime el **string de sesión** — copialo en `.env` como `TG_SESSION=...` para no tener que loguearte de nuevo.

**Deploy en Railway:**
1. Crear un proyecto en https://railway.app
2. Conectar el repositorio (solo carpeta `backend`)
3. Agregar las variables de entorno del `.env`
4. Agregar un volumen en `/data` y cambiar `DB_PATH=/data/teldrive.db`

### 3. Frontend (Vercel)

```bash
cd frontend
cp .env.example .env
# Editar VITE_API_URL con la URL de Railway
npm install
npm run dev
```

**Deploy en Vercel:**
1. Conectar el repo en https://vercel.com
2. Configurar `VITE_API_URL=https://tu-backend.railway.app/api`
3. Deploy automático

### 4. Agregar canales

Desde la PWA: **Agregar canal** → ingresar el `@username` o ID del grupo/canal.

Tenés que ser miembro del canal. Después hacés click en el botón de **re-indexar** (🔄) para escanear todos los archivos existentes.

### 5. Subir archivos con ruta

**Desde la app**: botón "Subir" → elegí canal + ruta + archivo.

**Desde Telegram directamente**: subí el archivo al canal con este caption:
```
path: /proyectos/3d/
```

El bot detecta el nuevo mensaje automáticamente y lo indexa.

---

## Convención de rutas

El caption del mensaje en Telegram define la carpeta:

```
path: /diseño/logos/        → aparece en Diseño > logos
path: /codigo/backend/      → aparece en codigo > backend
(sin caption)               → aparece en la raíz /
```

---

## Estructura del proyecto

```
teldrive/
├── backend/
│   ├── src/
│   │   ├── index.js       # Entry point
│   │   ├── db.js          # SQLite schema
│   │   ├── telegram.js    # Cliente MTProto
│   │   ├── indexer.js     # Escáner de canales + live listener
│   │   └── routes.js      # API REST
│   ├── railway.toml
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx        # App completa (PWA)
    │   ├── main.jsx
    │   └── lib/
    │       ├── api.js     # Cliente HTTP
    │       └── utils.js   # Helpers
    ├── vite.config.js
    └── package.json
```

---

## API Reference

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/channels` | Listar canales |
| POST | `/api/channels` | Agregar canal `{ username }` |
| DELETE | `/api/channels/:id` | Eliminar canal |
| POST | `/api/channels/:id/index` | Re-indexar canal |
| GET | `/api/files?channel_id=&path=` | Listar archivos |
| GET | `/api/tree/:channel_id` | Árbol de carpetas |
| GET | `/api/search?q=` | Buscar archivos |
| GET | `/api/download/:file_id` | Descargar archivo |
| POST | `/api/upload` | Subir archivo |
| GET | `/api/stats` | Estadísticas globales |

---

## Límites de Telegram

- Tamaño máx. por archivo: **2 GB** (cuenta premium: 4 GB)
- No hay límite de almacenamiento total
- La descarga a través del backend puede ser lenta para archivos grandes — considera implementar streaming con SSE en producción
