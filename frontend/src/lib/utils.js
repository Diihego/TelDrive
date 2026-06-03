export function formatSize(bytes) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0, n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const TYPE_ICON = {
  image:    '🖼',
  video:    '🎬',
  audio:    '🎵',
  pdf:      '📄',
  archive:  '📦',
  '3d':     '🧊',
  ztl:      '💀',
  zpr:      '🗿',
  code:     '💻',
  document: '📝',
  other:    '📎',
}

export const TYPE_COLOR = {
  image:    '#3b82f6',
  video:    '#8b5cf6',
  audio:    '#ec4899',
  pdf:      '#ef4444',
  archive:  '#f59e0b',
  '3d':     '#06b6d4',
  ztl:      '#e85d2f',
  zpr:      '#e85d2f',
  code:     '#22c55e',
  document: '#94a3b8',
  other:    '#64748b',
}

export function getFileIcon(type) {
  return TYPE_ICON[type] || TYPE_ICON.other
}
