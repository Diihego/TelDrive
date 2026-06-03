import initSqlJs from 'sql.js'
import fs from 'fs'

const dataDir = process.env.TELDRIVE_DATA_DIR || '.'
const DB_PATH = process.env.DB_PATH || (dataDir + '/teldrive.db')

const SQL = await initSqlJs()

let db
if (fs.existsSync(DB_PATH)) {
  db = new SQL.Database(fs.readFileSync(DB_PATH))
} else {
  db = new SQL.Database()
}

function save() {
  fs.writeFileSync(DB_PATH, db.export())
}

db.run(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    username TEXT,
    access_hash TEXT,
    added_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    file_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    size INTEGER,
    mime_type TEXT,
    type TEXT,
    date TEXT,
    part_group TEXT,
    part_num INTEGER,
    part_total INTEGER,
    part_name TEXT,
    UNIQUE(channel_id, message_id)
  );
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    full_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(channel_id, full_path)
  );
  CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
  CREATE INDEX IF NOT EXISTS idx_files_channel ON files(channel_id);
  CREATE INDEX IF NOT EXISTS idx_folders_channel ON folders(channel_id);
`)
save()

// Migraciones para DBs existentes
const migrations = [
  'ALTER TABLE channels ADD COLUMN access_hash TEXT',
  'CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL, full_path TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\')), UNIQUE(channel_id, full_path))',
  'CREATE INDEX IF NOT EXISTS idx_folders_channel ON folders(channel_id)',
  'ALTER TABLE files ADD COLUMN part_group TEXT',
  'ALTER TABLE files ADD COLUMN part_num INTEGER',
  'ALTER TABLE files ADD COLUMN part_total INTEGER',
  'ALTER TABLE files ADD COLUMN part_name TEXT',
  `CREATE TABLE IF NOT EXISTS download_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    file_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    tmp_path TEXT NOT NULL,
    total_size INTEGER,
    status TEXT DEFAULT 'preparing',
    notified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_dl_job ON download_sessions(job_id)',
  'ALTER TABLE download_sessions ADD COLUMN notified INTEGER DEFAULT 0',
]
for (const m of migrations) {
  try { db.run(m); save() } catch (_) {}
}

function normalizeParams(params) {
  if (params == null) return []
  if (Array.isArray(params)) return params
  if (typeof params === 'object') return params
  return [params]
}

let _inTransaction = false

function prepare(sql) {
  return {
    get: (params) => {
      const r = db.exec(sql, normalizeParams(params))
      if (!r.length || !r[0].values.length) return undefined
      const row = {}
      r[0].columns.forEach((c, i) => { row[c] = r[0].values[0][i] })
      return row
    },
    all: (params) => {
      const r = db.exec(sql, normalizeParams(params))
      if (!r.length) return []
      return r[0].values.map(v => {
        const row = {}
        r[0].columns.forEach((c, i) => { row[c] = v[i] })
        return row
      })
    },
    run: (params) => {
      db.run(sql, normalizeParams(params))
      // No guardar a disco dentro de una transacción — se hace al hacer COMMIT
      if (!_inTransaction) save()
      const rowid = db.exec('SELECT last_insert_rowid()')[0]
      const changes = db.exec('SELECT changes()')[0]
      return {
        lastInsertRowid: rowid && rowid.values[0] && rowid.values[0][0],
        changes: changes && changes.values[0] && changes.values[0][0],
      }
    },
  }
}

function transaction(fn) {
  return (args) => {
    _inTransaction = true
    db.run('BEGIN')
    try {
      fn(args)
      db.run('COMMIT')
      save()
    } catch (e) {
      try { db.run('ROLLBACK') } catch (_) {}
      throw e
    } finally {
      _inTransaction = false
    }
  }
}

export default { prepare, transaction }
