import React, { useState, useEffect, useCallback } from 'react' // teldrive
import { api } from './lib/api.js'
import { formatSize, getFileIcon, formatDate } from './lib/utils.js'

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────

const Icon = ({ d, size = 18, stroke = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const icons = {
  folder:    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plus:      'M12 5v14M5 12h14',
  download:  'M12 3v13m0 0-4-4m4 4 4-4M3 21h18',
  upload:    'M12 21V8m0 0-4 4m4-4 4 4M3 3h18',
  search:    'M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z',
  trash:     'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  refresh:   'M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-3.3M20 15a9 9 0 0 1-15 3.3',
  grid:      'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  list:      'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chevronR:  'M9 18l6-6-6-6',
  chevronD:  'M6 9l6 6 6-6',
  home:      'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  x:         'M18 6 6 18M6 6l12 12',
  sync:      'M4 12a8 8 0 0 1 14.93-4M20 4v4h-4M20 12a8 8 0 0 1-14.93 4M4 20v-4h4',
  newfolder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2zM12 11v6M9 14h6',
  move:      'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  edit:      'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  channel:   'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 21 16.92z',
}

const ICON_BTN = { background: 'none', border: 'none', padding: '2px', cursor: 'pointer' }


// ─── Styles ───────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #0a0a0f;
    --bg2:      #111118;
    --bg3:      #1a1a24;
    --border:   #ffffff12;
    --border2:  #ffffff20;
    --text:     #e8e8f0;
    --text2:    #9090a8;
    --text3:    #606075;
    --accent:   #6c63ff;
    --accent2:  #3ecfcf;
    --danger:   #ff4d6d;
    --font:     'Syne', sans-serif;
    --mono:     'DM Mono', monospace;
    --radius:   10px;
    --sidebar:  240px;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; }
  button { cursor: pointer; font-family: var(--font); }

  .app { display: flex; height: 100vh; overflow: hidden; }

  /* Sidebar canales */
  .sidebar-channels {
    background: var(--bg2); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; overflow: hidden;
    transition: width .2s ease; flex-shrink: 0;
  }
  .sidebar-channels.expanded { width: 220px; min-width: 220px; }
  .sidebar-channels.collapsed { width: 60px; min-width: 60px; }

  /* Sidebar árbol */
  .sidebar-tree-panel {
    background: var(--bg2); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; overflow: hidden;
    transition: width .2s ease; flex-shrink: 0;
  }
  .sidebar-tree-panel.visible { width: 200px; min-width: 200px; }
  .sidebar-tree-panel.hidden { width: 0; min-width: 0; border-right: none; }

  .sidebar-header {
    padding: 16px 12px 10px;
    border-bottom: 1px solid var(--border);
  }
  .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; display: flex; align-items: center; gap: 8px; }
  .logo span { color: var(--accent2); }
  .logo-sub { font-size: 11px; color: var(--text3); font-family: var(--mono); margin-top: 2px; }

  .sidebar-section { padding: 12px 8px 4px; }
  .sidebar-label { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 1.5px; padding: 0 8px 6px; font-family: var(--mono); display: flex; align-items: center; justify-content: space-between; }
  .sidebar-label button { background: none; border: none; color: var(--text3); cursor: pointer; padding: 0; display: flex; align-items: center; }
  .sidebar-label button:hover { color: var(--text); }
  .folder-tree { padding: 0 4px 8px; overflow-y: auto; max-height: 40vh; }
  .tree-node { display: flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tree-node:hover { background: var(--bg3); color: var(--text); }
  .tree-node.active { background: var(--accent)22; color: var(--accent2); }
  .tree-node .tree-toggle { flex-shrink: 0; color: var(--text3); display: flex; align-items: center; }
  .tree-node .tree-name { overflow: hidden; text-overflow: ellipsis; flex: 1; }

  /* Modo collapsed de canales */
  .ch-collapsed { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 4px 0; }
  .ch-collapsed-avatar { position: relative; cursor: pointer; }
  .ch-collapsed-avatar .ch-avatar { transition: box-shadow .15s; }
  .ch-collapsed-avatar:hover .ch-avatar { box-shadow: 0 0 0 2px var(--border2); }
  .ch-add-circle { width: 38px; height: 38px; border-radius: 50%; background: var(--bg3); border: 1px dashed var(--border2); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text3); font-size: 20px; transition: all .15s; }
  .ch-add-circle:hover { background: var(--accent)22; border-color: var(--accent2); color: var(--accent2); }

  .channel-cards { display: flex; flex-direction: column; gap: 6px; padding: 0 4px; }
  .channel-card {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 10px; cursor: pointer;
    border: 1px solid transparent; transition: all .15s; position: relative;
  }
  .channel-card:hover { background: var(--bg3); border-color: var(--border2); }
  .channel-card.active { background: var(--accent)18; border-color: var(--accent2)66; }
  .channel-card.drag-over { border-top: 2px solid var(--accent2); }
  .channel-card[draggable] { cursor: grab; }
  .ch-avatar {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: #fff;
    overflow: hidden; position: relative;
  }
  .ch-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .ch-avatar.active-ring { box-shadow: 0 0 0 2px var(--accent2); }
  .ch-info { flex: 1; min-width: 0; }
  .ch-info .ch-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
  .ch-info .ch-meta { font-size: 10px; color: var(--text3); font-family: var(--mono); margin-top: 1px; }
  .ch-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; flex-shrink: 0; }
  .channel-card:hover .ch-actions { opacity: 1; }

  .btn-add-channel {
    margin: 8px; padding: 8px 12px;
    background: var(--bg3); border: 1px dashed var(--border2);
    border-radius: 8px; color: var(--text2); font-size: 13px;
    display: flex; align-items: center; gap: 6px;
    transition: all .2s; width: calc(100% - 16px);
  }
  .btn-add-channel:hover { border-color: var(--accent); color: var(--accent); background: var(--accent)0a; }

  .sidebar-footer { margin-top: auto; padding: 12px; border-top: 1px solid var(--border); }
  .stats-mini { font-size: 11px; color: var(--text3); font-family: var(--mono); line-height: 1.8; }

  /* Main */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .topbar {
    padding: 14px 24px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 12px; background: var(--bg2);
  }
  .breadcrumb { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
  .breadcrumb-item { font-size: 13px; color: var(--text2); cursor: pointer; }
  .breadcrumb-item:hover { color: var(--text); }
  .breadcrumb-item.current { color: var(--text); font-weight: 600; }
  .breadcrumb-sep { color: var(--text3); }

  .search-box {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg3); border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 12px; min-width: 200px;
    transition: border-color .2s;
  }
  .search-box:focus-within { border-color: var(--accent); }
  .search-box input { background: none; border: none; outline: none; color: var(--text); font-size: 13px; width: 100%; font-family: var(--font); }
  .search-box input::placeholder { color: var(--text3); }

  .btn { padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; display: flex; align-items: center; gap: 6px; transition: all .2s; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #5a53ee; }
  .btn-ghost { background: var(--bg3); color: var(--text2); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--border2); }
  .btn-icon { padding: 7px; }
  .btn-danger { background: var(--danger)18; color: var(--danger); border: none; }
  .btn-danger:hover { background: var(--danger)28; }

  .view-toggle { display: flex; background: var(--bg3); border-radius: 8px; padding: 2px; border: 1px solid var(--border); }
  .view-toggle button { padding: 5px 8px; border: none; background: none; color: var(--text3); border-radius: 6px; transition: all .2s; display: flex; }
  .view-toggle button.active { background: var(--bg2); color: var(--text); }

  /* Content */
  .content { flex: 1; overflow-y: auto; padding: 24px; }
  .content::-webkit-scrollbar { width: 6px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

  /* File grid */
  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }

  .file-card {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px 12px 12px;
    cursor: pointer; transition: all .2s; display: flex; flex-direction: column; gap: 8px;
    position: relative; overflow: hidden;
  }
  .file-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--type-color, var(--accent)); opacity: 0; transition: opacity .2s; }
  .file-card:hover { border-color: var(--border2); background: var(--bg3); transform: translateY(-1px); }
  .file-card:hover::before { opacity: 1; }
  .file-icon { font-size: 32px; line-height: 1; }
  .file-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
  .file-meta { font-size: 11px; color: var(--text3); font-family: var(--mono); display: flex; flex-direction: column; gap: 2px; }
  .file-actions { display: flex; gap: 4px; opacity: 0; transition: opacity .2s; margin-top: auto; }
  .file-card:hover .file-actions { opacity: 1; }

  /* File list */
  .file-list { display: flex; flex-direction: column; gap: 1px; }
  .file-row {
    display: grid; grid-template-columns: 32px 1fr 80px 110px 100px; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background .15s;
  }
  .file-row:hover { background: var(--bg3); }
  .file-row .row-icon { font-size: 20px; text-align: center; }
  .file-row .row-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .file-row .row-meta { font-size: 11px; color: var(--text3); font-family: var(--mono); text-align: right; }

  /* Folder item (legacy, kept for compat) */
  .folder-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 8px; cursor: pointer;
    background: var(--bg2); border: 1px solid var(--border); transition: all .2s;
  }
  .folder-item:hover { border-color: var(--accent)50; background: var(--accent)08; }

  /* Folder card with image preview */
  .folder-card {
    position: relative; border-radius: var(--radius); cursor: pointer;
    border: 1px solid var(--border); overflow: hidden;
    height: 130px; transition: border-color .2s, transform .2s;
    background: var(--bg2);
  }
  .folder-card:hover { border-color: var(--accent)60; transform: translateY(-1px); }
  .folder-card.drag-over { border-color: var(--accent) !important; box-shadow: 0 0 0 2px var(--accent)40; }

  .folder-card-bgblur {
    position: absolute; inset: 0;
    background-size: cover; background-position: center;
    filter: blur(10px) brightness(0.5) saturate(0.7);
    transform: scale(1.08);
  }
  .folder-card-bg {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: contain;
  }
  .folder-card-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 100%);
  }
  .folder-card-strip {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 2;
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px;
    background: rgba(0,0,0,0.62); backdrop-filter: blur(8px);
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .folder-del { opacity: 0; transition: opacity .15s; }
  .folder-card:hover .folder-del { opacity: 1; }
  .file-checkbox { position: absolute; top: 6px; left: 6px; z-index: 3; opacity: 0; transition: opacity .15s; accent-color: var(--accent2); width: 15px; height: 15px; cursor: pointer; }
  .file-card:hover .file-checkbox, .file-checkbox:checked { opacity: 1; }
  .file-card.selected { border-color: var(--accent2); background: var(--accent)18; }
  .selection-bar { position: sticky; top: 0; z-index: 10; background: var(--bg2); border: 1px solid var(--accent2); border-radius: 10px; padding: 8px 14px; display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .selection-bar span { font-size: 13px; font-weight: 500; flex: 1; }
  .folder-card-name {
    flex: 1; font-size: 13px; font-weight: 600; color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .folder-card-count {
    font-size: 10px; font-family: var(--mono);
    color: rgba(255,255,255,0.45); flex-shrink: 0;
  }
  .folder-card-body { display: none; }

  /* Drag & drop */
  .content.drag-over { outline: 2px dashed var(--accent); outline-offset: -8px; background: var(--accent)08; }

  /* Lightbox */
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .lightbox-img { max-width: 90vw; max-height: 85vh; object-fit: contain; border-radius: 4px; }
  .lightbox-loader { width: 48px; height: 48px; border: 3px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .lightbox-bar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; color: #fff; font-size: 13px; max-width: 90vw; }
  .lightbox-name { opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .file-card[draggable], .file-row[draggable] { cursor: grab; }
  .thumb-wrap { width: 100%; aspect-ratio: 1; border-radius: 6px; overflow: hidden; background: var(--bg3); display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  .thumb-wrap img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-placeholder { font-size: 32px; }
  .file-card[draggable]:active, .file-row[draggable]:active { cursor: grabbing; opacity: 0.7; }
  .drop-hint { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: #fff; padding: 8px 18px; border-radius: 20px;
    font-size: 13px; pointer-events: none; z-index: 9999; opacity: 0.95; }

  .folder-item .f-name { font-size: 14px; font-weight: 600; }
  .folder-item .f-count { font-size: 11px; color: var(--text3); font-family: var(--mono); margin-left: auto; }

  /* Empty state */
  .empty { text-align: center; padding: 80px 20px; color: var(--text3); }
  .empty-icon { font-size: 48px; margin-bottom: 16px; }
  .empty h3 { font-size: 18px; color: var(--text2); margin-bottom: 8px; }
  .empty p { font-size: 14px; line-height: 1.6; }

  /* Modal */
  .overlay { position: fixed; inset: 0; background: #00000088; display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(4px); }
  .modal { background: var(--bg2); border: 1px solid var(--border2); border-radius: 14px; padding: 28px; width: 420px; max-width: 95vw; }
  .modal h2 { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
  .modal-input { width: 100%; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 14px; font-family: var(--font); outline: none; transition: border-color .2s; }
  .modal-input:focus { border-color: var(--accent); }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
  .modal-hint { font-size: 12px; color: var(--text3); margin-top: 6px; }

  /* Upload area */
  .upload-zone {
    border: 2px dashed var(--border2); border-radius: 12px; padding: 32px;
    text-align: center; cursor: pointer; transition: all .2s;
    background: var(--bg3);
  }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--accent); background: var(--accent)0a; }
  .upload-zone p { font-size: 14px; color: var(--text2); margin-top: 12px; }
  .upload-zone small { font-size: 12px; color: var(--text3); margin-top: 4px; display: block; }
  .upload-progress { margin-top: 16px; }
  .progress-bar { height: 4px; background: var(--bg); border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width .3s; }

  /* Transfer panel */
  .transfer-panel {
    position: fixed; bottom: 24px; left: 24px; z-index: 300;
    display: flex; flex-direction: column; gap: 8px; max-width: 340px; width: 100%;
  }
  .transfer-card {
    background: var(--bg2); border: 1px solid var(--border2); border-radius: 12px;
    padding: 12px 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    animation: slideIn .2s ease;
  }
  .transfer-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .transfer-card-name { flex: 1; font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .transfer-card-status { font-size: 10px; font-family: var(--mono); color: var(--text3); }
  .transfer-bar-track { height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden; margin-bottom: 6px; }
  .transfer-bar-fill { height: 100%; border-radius: 2px; transition: width .3s; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
  .transfer-meta { display: flex; justify-content: space-between; font-size: 10px; font-family: var(--mono); color: var(--text3); }

  /* Toast */
  .toast-container { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 200; }
  .toast { background: var(--bg2); border: 1px solid var(--border2); border-radius: 10px; padding: 12px 16px; font-size: 13px; display: flex; align-items: center; gap: 10px; animation: slideIn .2s ease; }
  .toast.error { border-color: var(--danger); }
  .toast.success { border-color: #22c55e50; }
  @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  /* Loading */
  .spinner { width: 20px; height: 20px; border: 2px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .tag { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-family: var(--mono); font-weight: 500; }

  @media (max-width: 640px) {
    .sidebar-channels.expanded { width: 180px; min-width: 180px; }
    .sidebar-tree-panel.visible { width: 160px; min-width: 160px; }
    .topbar { padding: 10px 14px; gap: 8px; }
    .search-box { min-width: 120px; }
    .content { padding: 14px; }
    .file-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
    .file-row { grid-template-columns: 28px 1fr 80px; }
    .file-row .row-meta:nth-child(4), .file-row .row-meta:nth-child(5) { display: none; }
  }
`

// ─── Transfer manager ─────────────────────────────────────────────────────────

let _setTransfers
const transferStore = { transfers: [] }

function addTransfer(t) {
  const id = Date.now() + Math.random()
  transferStore.transfers = [...transferStore.transfers, { id, ...t }]
  _setTransfers && _setTransfers([...transferStore.transfers])
  return id
}
function updateTransfer(id, data) {
  transferStore.transfers = transferStore.transfers.map(t => t.id === id ? { ...t, ...data } : t)
  _setTransfers && _setTransfers([...transferStore.transfers])
}
function removeTransfer(id) {
  setTimeout(() => {
    transferStore.transfers = transferStore.transfers.filter(t => t.id !== id)
    _setTransfers && _setTransfers([...transferStore.transfers])
  }, 2000)
}

function formatSpeed(bps) {
  if (!bps || bps < 0) return '—'
  if (bps > 1e6) return (bps / 1e6).toFixed(1) + ' MB/s'
  if (bps > 1e3) return (bps / 1e3).toFixed(0) + ' KB/s'
  return bps.toFixed(0) + ' B/s'
}
function formatETA(bytes, bps) {
  if (!bps || !bytes) return ''
  const s = bytes / bps
  if (s > 3600) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm'
  if (s > 60) return Math.floor(s / 60) + 'm ' + Math.floor(s % 60) + 's'
  return Math.floor(s) + 's'
}

function TransferPanel() {
  const [transfers, setTransfers] = useState([])
  _setTransfers = setTransfers
  if (!transfers.length) return null
  return (
    <div className="transfer-panel">
      {transfers.map(t => {
        const isDone = t.status === 'done'
        const isError = t.status === 'error'
        const pct = t.progress || 0
        const remaining = t.total ? t.total * (1 - pct / 100) : null
        return (
          <div key={t.id} className="transfer-card">
            <div className="transfer-card-header">
              <span style={{ fontSize: 14 }}>{t.type === 'download' ? '⬇️' : '⬆️'}</span>
              <span className="transfer-card-name" title={t.name}>{t.name}</span>
              <span className="transfer-card-status" style={{ color: isDone ? '#22c55e' : isError ? 'var(--danger)' : 'var(--text3)' }}>
                {isDone ? '✓ listo' : isError ? '✗ error' : `${pct}%`}
              </span>
              <button onClick={() => removeTransfer(t.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
            <div className="transfer-bar-track">
              <div className="transfer-bar-fill" style={{ width: pct + '%', background: isDone ? '#22c55e' : isError ? 'var(--danger)' : undefined }} />
            </div>
            <div className="transfer-meta">
              <span>{formatSpeed(t.speed)}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {t.partTotal > 1 && (
                  <span style={{ background: 'var(--accent)28', color: 'var(--accent2)', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--mono)' }}>
                    PARTE {t.part}/{t.partTotal}
                  </span>
                )}
                {!isDone && !isError && remaining ? 'ETA ' + formatETA(remaining, t.speed) : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Toast system ──────────────────────────────────────────────────────────────

let _setToasts
function toast(msg, type = 'info') {
  _setToasts(ts => [...ts, { id: Date.now(), msg, type }])
  setTimeout(() => _setToasts(ts => ts.slice(1)), 3500)
}

function Toasts() {
  const [toasts, setToasts] = useState([])
  _setToasts = setToasts
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ─── Add Channel Modal ────────────────────────────────────────────────────────

function AddChannelModal({ onClose, onAdd }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null) // { tg_id, name, username }
  const [loading, setLoading] = useState(false)

  // Cargar al abrir y al escribir
  useEffect(() => {
    setSelected(null)
    const delay = q ? 400 : 0
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.searchChannels(q.trim())
        setResults(res)
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, delay)
    return () => clearTimeout(t)
  }, [q])

  async function submit() {
    const target = selected?.username || selected?.tg_id || q.trim().replace('@', '')
    if (!target) return
    setLoading(true)
    try {
      const ch = await api.addChannel(target)
      onAdd(ch)
      toast('Canal agregado: ' + ch.name, 'success')
      onClose()
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>➕ Agregar canal</h2>

        <div style={{ position: 'relative' }}>
          <input
            className="modal-input"
            placeholder="Buscar canal o pegar @username / ID..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !results.length && submit()}
            autoFocus
          />
          {searching && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
            </span>
          )}
        </div>

        {results.length > 0 && (
          <div style={{
            marginTop: 6, border: '1px solid var(--border2)', borderRadius: 8,
            overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
          }}>
            {results.map(ch => (
              <div
                key={ch.tg_id}
                onClick={() => { setSelected(ch); setQ(ch.name); setResults([]) }}
                style={{
                  padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  background: selected?.tg_id === ch.tg_id ? 'var(--accent)18' : 'var(--bg3)',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)12'}
                onMouseLeave={e => e.currentTarget.style.background = selected?.tg_id === ch.tg_id ? 'var(--accent)18' : 'var(--bg3)'}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--accent)30', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)',
                }}>
                  {ch.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {ch.username ? '@' + ch.username : 'ID: ' + ch.tg_id}
                    {ch.members ? ' · ' + ch.members.toLocaleString() + ' miembros' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="modal-hint" style={{ marginTop: 8 }}>Debes ser miembro del canal para indexarlo.</p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || (!selected && !q.trim())}>
            {loading ? <span className="spinner" /> : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RenameModal({ item, type, channelId, onClose, onRenamed }) {
  const [name, setName] = React.useState(type === 'folder' ? item.name : (item.alias || item.part_name || item.name))
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === item.name) { onClose(); return }
    setLoading(true)
    try {
      if (type === 'folder') {
        await api.renameFolder(channelId, item.path, trimmed)
      } else {
        await api.renameFile(item.id, trimmed)
      }
      onRenamed()
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    } finally { setLoading(false) }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <h2>✏️ Renombrar</h2>
        <input className="modal-input" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
          autoFocus />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !name.trim()}>
            {loading ? <span className="spinner" /> : 'Renombrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────


// ─── New Folder Modal ──────────────────────────────────────────────────────────

// Move Modal

function flattenTree(node, result = []) {
  if (node.path !== undefined) result.push({ path: node.path, name: node.name })
  for (const child of node.children || []) flattenTree(child, result)
  return result
}

function MoveModal({ file, tree, onClose, onMoved }) {
  const [selected, setSelected] = useState(file.path)
  const [loading, setLoading] = useState(false)
  const folders = tree ? flattenTree(tree) : [{ path: '/', name: '/' }]

  async function submit() {
    if (selected === file.path) { onClose(); return }
    setLoading(true)
    try {
      const ids = file._bulkIds || [file.id]
      for (const id of ids) await api.moveFile(id, selected)
      toast(ids.length > 1 ? `${ids.length} archivos movidos a ${selected}` : 'Movido a ' + selected, 'success')
      onMoved()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Mover archivo</h2>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
          <strong>{file.name}</strong>
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
          {folders.map(f => (
            <div key={f.path}
              onClick={() => setSelected(f.path)}
              style={{
                padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                background: selected === f.path ? 'var(--accent)20' : 'transparent',
                color: selected === f.path ? 'var(--accent)' : 'var(--text)',
                borderLeft: selected === f.path ? '3px solid var(--accent)' : '3px solid transparent',
              }}>
              <Icon d={icons.folder} size={14} stroke="var(--accent2)" />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{f.path}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || selected === file.path}>
            {loading ? <span className="spinner" /> : 'Mover aqui'}
          </button>
        </div>
      </div>
    </div>
  )
}


function NewFolderModal({ channel, currentPath, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      await api.createFolder(channel.id, currentPath, trimmed)
      toast('Carpeta creada: ' + trimmed, 'success')
      onCreated()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>📁 Nueva carpeta</h2>
        <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text3)' }}>
          En: {currentPath}
        </div>
        <input
          className="modal-input"
          placeholder="Nombre de la carpeta"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !name.trim()}>
            {loading ? <span className="spinner" /> : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadModal({ channels, currentChannel, currentPath, onClose, onUploaded }) {
  const [channelId, setChannelId] = useState(currentChannel?.id || '')
  const [filePath, setFilePath] = useState(currentPath || '/')
  const [mode, setMode] = useState('file') // 'file' | 'folder'
  const [file, setFile] = useState(null)
  const [folderFiles, setFolderFiles] = useState([]) // [{ file, relativePath }]
  const [drag, setDrag] = useState(false)

  function normalizePath(p) {
    if (!p.startsWith('/')) p = '/' + p
    if (!p.endsWith('/')) p = p + '/'
    return p
  }

  function submitFile() {
    if (!channelId || !file) return
    const jobId = crypto.randomUUID()
    const transferId = addTransfer({ type: 'upload', name: file.name, progress: 0, speed: 0, status: 'uploading', part: 1, partTotal: 1 })
    onClose()
    const sse = new EventSource(api.uploadProgressUrl(jobId))
    sse.onmessage = (e) => {
      const d = JSON.parse(e.data)
      updateTransfer(transferId, { progress: d.progress, speed: d.speed, status: d.status, part: d.part, partTotal: d.partTotal })
      if (d.status === 'done' || d.status === 'error') sse.close()
    }
    api.upload(channelId, normalizePath(filePath), file, jobId)
      .then(result => {
        if (result.error) throw new Error(result.error)
        updateTransfer(transferId, { status: 'done', progress: 100, speed: 0 })
        removeTransfer(transferId)
        toast(result.multipart ? `Subido en ${result.parts} partes: ${file.name}` : 'Subido: ' + file.name, 'success')
        onUploaded()
      })
      .catch(e => { sse.close(); updateTransfer(transferId, { status: 'error' }); removeTransfer(transferId); toast(e.message, 'error') })
  }

  async function submitFolder() {
    if (!channelId || !folderFiles.length) return
    const base = normalizePath(filePath)
    const total = folderFiles.length
    const batchId = addTransfer({ type: 'upload', name: `📁 ${total} archivos`, progress: 0, speed: 0, status: 'uploading', part: 0, partTotal: total })
    onClose()

    // Crear carpetas únicas primero
    const uniqueDirs = [...new Set(folderFiles.map(({ relativePath }) => {
      const parts = relativePath.split('/')
      parts.pop() // quitar filename
      return parts.join('/')
    }).filter(Boolean))]

    for (const dir of uniqueDirs) {
      const segments = dir.split('/')
      let accumulated = base
      for (const seg of segments) {
        if (!seg) continue
        try { await api.createFolder(parseInt(channelId), accumulated, seg) } catch (_) { /* ya existe */ }
        accumulated = accumulated + seg + '/'
      }
    }

    // Subir archivos secuencialmente
    let done = 0
    for (const { file: f, relativePath } of folderFiles) {
      const parts = relativePath.split('/')
      parts.pop()
      const destPath = base + (parts.length ? parts.join('/') + '/' : '')
      const jobId = crypto.randomUUID()
      updateTransfer(batchId, { name: `📁 ${done}/${total}: ${f.name}`, part: done, partTotal: total, progress: Math.round(done / total * 100) })

      const sse = new EventSource(api.uploadProgressUrl(jobId))
      sse.onmessage = (e) => {
        const d = JSON.parse(e.data)
        if (d.status === 'done' || d.status === 'error') sse.close()
      }

      try {
        const result = await api.upload(channelId, destPath, f, jobId)
        if (result.error) throw new Error(result.error)
      } catch (e) {
        toast(`Error subiendo ${f.name}: ${e.message}`, 'error')
      }
      done++
    }

    updateTransfer(batchId, { status: 'done', progress: 100 })
    removeTransfer(batchId)
    toast(`Carpeta subida: ${total} archivos`, 'success')
    onUploaded()
  }

  function handleFolderInput(e) {
    const files = Array.from(e.target.files)
    setFolderFiles(files.map(f => ({ file: f, relativePath: f.webkitRelativePath || f.name })))
  }

  function handleDrop(e) {
    e.preventDefault(); setDrag(false)
    if (mode === 'file') {
      setFile(e.dataTransfer.files[0])
    } else {
      const files = Array.from(e.dataTransfer.files)
      setFolderFiles(files.map(f => ({ file: f, relativePath: f.webkitRelativePath || f.name })))
    }
  }

  const canSubmit = channelId && (mode === 'file' ? !!file : folderFiles.length > 0)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>⬆️ Subir</h2>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {['file','folder'].map(m => (
            <button key={m} className={`btn ${mode === m ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: 13 }} onClick={() => { setMode(m); setFile(null); setFolderFiles([]) }}>
              {m === 'file' ? '📄 Archivo' : '📁 Carpeta'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, display: 'block' }}>Canal destino</label>
            <select className="modal-input" value={channelId} onChange={e => setChannelId(e.target.value)}>
              <option value="">Seleccionar canal...</option>
              {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, display: 'block' }}>Ruta destino</label>
            <input className="modal-input" placeholder="/carpeta/subcarpeta/"
              value={filePath} onChange={e => setFilePath(e.target.value)} />
            <p className="modal-hint">{mode === 'folder' ? 'La estructura interna de la carpeta se preserva dentro de esta ruta.' : 'Ej: /proyectos/3d/'}</p>
          </div>

          <div className={`upload-zone ${drag ? 'drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('upload-input').click()}>
            {mode === 'file'
              ? <input id="upload-input" type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
              : <input id="upload-input" type="file" style={{ display: 'none' }} webkitdirectory="true" onChange={handleFolderInput} />}
            <div style={{ fontSize: 32 }}>{mode === 'file' ? '📎' : '📁'}</div>
            {mode === 'file'
              ? file
                ? <p style={{ color: 'var(--accent2)' }}>{file.name}</p>
                : <><p>Arrastra o haz click para elegir</p><small>Cualquier tipo de archivo</small></>
              : folderFiles.length
                ? <p style={{ color: 'var(--accent2)' }}>{folderFiles[0].relativePath.split('/')[0]} — {folderFiles.length} archivos</p>
                : <><p>Haz click para elegir carpeta</p><small>Se sube toda la estructura de carpetas sin límite de profundidad</small></>}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={mode === 'file' ? submitFile : submitFolder} disabled={!canSubmit}>
            Subir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── File Card ────────────────────────────────────────────────────────────────

const TYPE_COLOR_MAP = {
  image: '#3b82f6', video: '#8b5cf6', audio: '#ec4899', pdf: '#ef4444',
  archive: '#f59e0b', '3d': '#06b6d4', zbrush: '#e85d2f', code: '#22c55e', document: '#94a3b8', other: '#64748b',
}

function Lightbox({ file, onClose }) {
  const [loaded, setLoaded] = React.useState(false)
  const src = api.previewUrl(file.id)
  const isVideo = file.type === 'video'

  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
        <span className="lightbox-name">{file.name}</span>
        <a href={api.downloadUrl(file.id)} download={file.name}
          style={{ color: 'var(--accent2)', textDecoration: 'none', fontSize: 12 }}
          onClick={e => e.stopPropagation()}>
          Descargar
        </a>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={onClose}>
        {!loaded && <div className="lightbox-loader" />}
        {isVideo ? (
          <video
            src={src}
            controls
            autoPlay
            style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, display: loaded ? 'block' : 'none' }}
            onCanPlay={() => setLoaded(true)}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <img
            className="lightbox-img"
            src={src}
            style={{ display: loaded ? 'block' : 'none' }}
            onLoad={() => setLoaded(true)}
            onClick={e => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  )
}


function LazyThumb({ fileId, icon }) {
  const ref = React.useRef()
  const [src, setSrc] = React.useState(null)
  const [loaded, setLoaded] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSrc(api.thumbUrl(fileId))
        obs.disconnect()
      }
    }, { rootMargin: '100px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [fileId])

  return (
    <div className="thumb-wrap" ref={ref}>
      {src && !error
        ? <img src={src} onLoad={() => setLoaded(true)} onError={() => setError(true)}
            style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }} />
        : null}
      {(!src || error || !loaded) && <span className="thumb-placeholder">{icon}</span>}
    </div>
  )
}


function FileCard({ file, view, onDownload, onMove, onDelete, onRename, onPreview, selected, onSelect, selectMode, onEnterSelect }) {
  const color = TYPE_COLOR_MAP[file.type] || '#64748b'
  const holdRef = React.useRef(null)

  function handlePointerDown(e) {
    if (selectMode) return
    holdRef.current = setTimeout(() => {
      holdRef.current = null
      onEnterSelect && onEnterSelect(file.id)
    }, 500)
  }
  function handlePointerUp() {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
  }
  function handlePointerLeave() {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
  }
  function handleCardClick(e) {
    if (selectMode) { onSelect && onSelect(file.id); return }
  }
  if (view === 'list') {
    return (
      <div className={`file-row${selected ? ' selected' : ''}`}
        style={{ userSelect: 'none' }}
        draggable={!selectMode}
        onDragStart={e => { if (selectMode) { e.preventDefault(); return } e.dataTransfer.setData('teldrive-file-id', String(file.id)); e.dataTransfer.effectAllowed = 'move' }}
        onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={handlePointerLeave}
        onClick={handleCardClick}>
        <span className="row-icon" style={{ position: 'relative' }}>
          <input type="checkbox" className="file-checkbox" style={{ position: 'relative', opacity: 1 }} checked={!!selected} onChange={() => onSelect && onSelect(file.id)} onClick={e => e.stopPropagation()} />
        </span>
        <span className="row-name" title={file.name}>{file.name}{file.part_total > 1 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent2)' }}>⛓ {file.part_total} partes</span>}</span>
        <span className="row-meta">{formatSize(file.size)}</span>
        <span className="row-meta">{formatDate(file.date)}</span>
        <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
          {!selectMode && <>
            <button className="btn btn-ghost btn-icon" onClick={e => { e.stopPropagation(); onRename(file) }} title="Renombrar">
              <Icon d={icons.edit} size={13} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={e => { e.stopPropagation(); onMove(file) }} title="Mover">
              <Icon d={icons.move} size={14} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={e => { e.stopPropagation(); onDownload(file) }} title="Descargar">
              <Icon d={icons.download} size={14} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={e => { e.stopPropagation(); onDelete(file) }} title="Eliminar" style={{ color: 'var(--danger, #ef4444)' }}>
              <Icon d={icons.trash} size={14} />
            </button>
          </>}
        </span>
      </div>
    )
  }
  return (
    <div className={`file-card${selected ? ' selected' : ''}`}
      style={{ '--type-color': color, position: 'relative', userSelect: 'none' }}
      draggable={!selectMode}
      onDragStart={e => { if (selectMode) { e.preventDefault(); return } e.dataTransfer.setData('teldrive-file-id', String(file.id)); e.dataTransfer.effectAllowed = 'move' }}
      onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={handlePointerLeave}
      onClick={handleCardClick}>
      <input type="checkbox" className="file-checkbox" checked={!!selected} onChange={() => onSelect && onSelect(file.id)} onClick={e => e.stopPropagation()} />
      {(file.type === 'image' || file.type === 'video')
        ? <div style={{ cursor: selectMode ? 'default' : 'zoom-in' }} onClick={e => { if (selectMode) return; onPreview && onPreview(file) }}><LazyThumb fileId={file.id} icon={getFileIcon(file.type)} /></div>
        : <div className="file-icon">{getFileIcon(file.type)}</div>}
      <div className="file-name" title={file.name}>{file.name}</div>
      <div className="file-meta">
        <span>{formatSize(file.size)}</span>
        {file.part_total > 1 && <span style={{ color: 'var(--accent2)', fontSize: 10 }}>{'⛓ ' + file.part_total + ' partes'}</span>}
        <span>{formatDate(file.date)}</span>
      </div>
      {!selectMode && <div className="file-actions">
        <button className="btn btn-ghost btn-icon" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); onRename(file) }} title="Renombrar">
          <Icon d={icons.edit} size={12} />
        </button>
        <button className="btn btn-ghost btn-icon" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); onMove(file) }} title="Mover">
          <Icon d={icons.move} size={13} />
        </button>
        <button className="btn btn-ghost btn-icon" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); onDownload(file) }} title="Descargar">
          <Icon d={icons.download} size={13} />
        </button>
        <button className="btn btn-ghost btn-icon" style={{ fontSize: 12, color: 'var(--danger, #ef4444)' }} onClick={e => { e.stopPropagation(); onDelete(file) }} title="Eliminar">
          <Icon d={icons.trash} size={13} />
        </button>
      </div>}
    </div>
  )
}

// ─── Folder Card with lazy image preview ─────────────────────────────────────

const folderThumbCache = new Map() // path → { status: 'loading'|'found'|'empty', fileId?: number }

function FolderCard({ folder, channelId, onClick, onDelete, onRename, dragOver, onDragOver, onDragLeave, onDrop }) {
  const ref = React.useRef()
  const [thumb, setThumb] = React.useState(() => folderThumbCache.get(folder.path) || null)

  React.useEffect(() => {
    if (thumb) return // already have result
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      obs.disconnect()
      const cached = folderThumbCache.get(folder.path)
      if (cached) { setThumb(cached); return }

      api.getFiles({ channel_id: channelId, path: folder.path, limit: 8 })
        .then(res => {
          const img = (res.files || []).find(f => f.type === 'image')
          const result = img ? { status: 'found', fileId: img.id } : { status: 'empty' }
          folderThumbCache.set(folder.path, result)
          setThumb(result)
        })
        .catch(() => {
          const result = { status: 'empty' }
          folderThumbCache.set(folder.path, result)
          setThumb(result)
        })
    }, { rootMargin: '120px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [folder.path, channelId, thumb])

  const hasImg = thumb?.status === 'found'

  return (
    <div
      ref={ref}
      className={"folder-card" + (dragOver ? ' drag-over' : '')}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {hasImg ? <>
        {/* Blurred cover fill — eliminates black bars */}
        <div className="folder-card-bgblur" style={{ backgroundImage: `url(${api.thumbUrl(thumb.fileId)})` }} />
        {/* Actual image contained */}
        <img src={api.thumbUrl(thumb.fileId)} className="folder-card-bg" alt="" loading="lazy" />
        {/* Bottom gradient for text */}
        <div className="folder-card-overlay" />
        {/* Folder strip top */}
        <div className="folder-card-strip">
          <Icon d={icons.folder} size={15} stroke="var(--accent2)" />
          <span className="folder-card-name">{folder.name}</span>
          {folder.count != null && <span className="folder-card-count">{folder.count}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            {onRename && <button className="btn btn-ghost btn-icon folder-del" style={{ padding: 2 }}
              onClick={e => { e.stopPropagation(); onRename(folder) }} title="Renombrar">
              <Icon d={icons.edit} size={12} />
            </button>}
            {onDelete && <button className="btn btn-ghost btn-icon folder-del" style={{ color: 'var(--danger, #ef4444)', padding: 2 }}
              onClick={e => { e.stopPropagation(); onDelete(folder) }} title="Eliminar carpeta">
              <Icon d={icons.trash} size={12} />
            </button>}
          </span>
        </div>
      </> : <>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={icons.folder} size={34} stroke="var(--accent2)" />
        </div>
        <div className="folder-card-strip">
          <Icon d={icons.folder} size={15} stroke="var(--accent2)" />
          <span className="folder-card-name">{folder.name}</span>
          {folder.count != null && <span className="folder-card-count">{folder.count}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            {onRename && <button className="btn btn-ghost btn-icon folder-del" style={{ padding: 2 }}
              onClick={e => { e.stopPropagation(); onRename(folder) }} title="Renombrar">
              <Icon d={icons.edit} size={12} />
            </button>}
            {onDelete && <button className="btn btn-ghost btn-icon folder-del" style={{ color: 'var(--danger, #ef4444)', padding: 2 }}
              onClick={e => { e.stopPropagation(); onDelete(folder) }} title="Eliminar carpeta">
              <Icon d={icons.trash} size={12} />
            </button>}
          </span>
        </div>
      </>}
    </div>
  )
}

// ─── Folder strip ──────────────────────────────────────────────────────────────

// Colores para avatares sin foto
const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#06b6d4','#6366f1']
function avatarColor(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xfffff; return AVATAR_COLORS[h % AVATAR_COLORS.length] }
function avatarInitial(name) { return (name || '?').replace(/^@/, '').charAt(0).toUpperCase() }

function ChannelAvatar({ channel, active, size = 38 }) {
  const [src, setSrc] = React.useState(() => api.channelPhotoUrl(channel.id))
  const [failed, setFailed] = React.useState(false)
  const color = avatarColor(channel.name)
  const initial = avatarInitial(channel.name)

  return (
    <div className={`ch-avatar${active ? ' active-ring' : ''}`}
      style={{ width: size, height: size, background: failed ? color : 'var(--bg3)' }}>
      {!failed
        ? <img src={src} onError={() => setFailed(true)} alt={channel.name} />
        : <span>{initial}</span>}
    </div>
  )
}

function SidebarTree({ tree, currentPath, onNavigate }) {
  const [visible, setVisible] = React.useState(true)
  return (
    <div className="sidebar-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <div className="sidebar-label">
        <span>Carpetas</span>
        <button onClick={() => setVisible(v => !v)} title={visible ? 'Ocultar' : 'Mostrar'}>
          <Icon d={visible ? icons.chevronD : icons.chevronR} size={12} />
        </button>
      </div>
      {visible && (
        <div className="folder-tree">
          <FolderTreeNode node={tree} currentPath={currentPath} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

function FolderTreeNode({ node, currentPath, onNavigate, depth = 0, channelName }) {
  const isRoot = node.path === '/'
  const [open, setOpen] = React.useState(true) // siempre abierto por defecto
  const hasChildren = node.children && node.children.length > 0
  const isActive = currentPath === node.path

  React.useEffect(() => {
    if (currentPath.startsWith(node.path)) setOpen(true)
  }, [currentPath, node.path])

  if (isRoot) {
    return (
      <div>
        <div className={`tree-node${isActive ? ' active' : ''}`} style={{ paddingLeft: 6 }}
          onClick={() => onNavigate('/')}>
          <span className="tree-toggle" onClick={e => { if (hasChildren) { e.stopPropagation(); setOpen(o => !o) } }}>
            {hasChildren ? <Icon d={open ? icons.chevronD : icons.chevronR} size={11} /> : <span style={{ width: 11 }} />}
          </span>
          <Icon d={icons.folder} size={12} stroke={isActive ? 'var(--accent2)' : 'var(--text3)'} />
          <span className="tree-name">Inicio</span>
        </div>
        {open && hasChildren && (
          <div>
            {node.children.map(c => <FolderTreeNode key={c.path} node={c} currentPath={currentPath} onNavigate={onNavigate} depth={1} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className={`tree-node${isActive ? ' active' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onNavigate(node.path)}>
        <span className="tree-toggle" onClick={e => { if (hasChildren) { e.stopPropagation(); setOpen(o => !o) } }}>
          {hasChildren
            ? <Icon d={open ? icons.chevronD : icons.chevronR} size={11} />
            : <span style={{ width: 11 }} />}
        </span>
        <Icon d={icons.folder} size={12} stroke={isActive ? 'var(--accent2)' : 'var(--text3)'} />
        <span className="tree-name">{node.name}</span>
        {node.count > 0 && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto', flexShrink: 0 }}>{node.count}</span>}
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map(c => <FolderTreeNode key={c.path} node={c} currentPath={currentPath} onNavigate={onNavigate} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

// ─── Virtual Grid ─────────────────────────────────────────────────────────────

function VirtualGrid({ items, renderItem, itemWidth = 160, itemHeight = 200, gap = 12 }) {
  const containerRef = React.useRef()
  const [visibleRange, setVisibleRange] = React.useState({ start: 0, end: 50 })
  const [cols, setCols] = React.useState(4)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      const width = container.offsetWidth
      const c = Math.max(1, Math.floor((width + gap) / (itemWidth + gap)))
      setCols(c)
      const rowH = itemHeight + gap
      const scrollTop = container.parentElement?.scrollTop || window.scrollY
      const viewH = container.parentElement?.offsetHeight || window.innerHeight
      const startRow = Math.max(0, Math.floor(scrollTop / rowH) - 2)
      const endRow = Math.ceil((scrollTop + viewH) / rowH) + 2
      setVisibleRange({ start: startRow * c, end: endRow * c })
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    const scrollEl = container.parentElement || window
    scrollEl.addEventListener('scroll', update, { passive: true })
    return () => { ro.disconnect(); scrollEl.removeEventListener('scroll', update) }
  }, [items.length, itemWidth, itemHeight, gap])

  const rows = Math.ceil(items.length / cols)
  const totalHeight = rows * (itemHeight + gap)
  const visible = items.slice(visibleRange.start, visibleRange.end)
  const startRow = Math.floor(visibleRange.start / cols)

  return (
    <div ref={containerRef} style={{ position: 'relative', height: totalHeight }}>
      <div style={{ position: 'absolute', top: startRow * (itemHeight + gap), left: 0, right: 0,
        display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${itemWidth}px, 1fr))`, gap }}>
        {visible.map((item, i) => renderItem(item, visibleRange.start + i))}
      </div>
    </div>
  )
}

function getFolderChildren(tree, currentPath) {
  if (!tree) return []
  function find(node, path) {
    if (node.path === path) return node.children || []
    for (const c of node.children || []) {
      const r = find(c, path)
      if (r !== null) return r
    }
    return null
  }
  return find(tree, currentPath) || []
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onDone }) {
  const [step, setStep] = useState('credentials')
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run(fn) {
    setLoading(true); setError('')
    try { await fn() } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const steps = ['Credenciales', 'Teléfono', 'Código', 'Listo']
  const stepIndex = { credentials: 0, phone: 1, code: 2, '2fa': 2, done: 3 }[step]

  const stepContent = {
    credentials: {
      title: 'Credenciales de Telegram',
      subtitle: 'Necesitas tu API ID y API Hash. Son gratuitos y se obtienen en my.telegram.org',
      // (link en la guía lateral)
    },
    phone: { title: 'Número de teléfono', subtitle: 'Ingresa el número asociado a tu cuenta de Telegram con código de país.', back: 'credentials' },
    code: { title: 'Código de verificación', subtitle: 'Telegram te envió un código. Revisa la app de Telegram o tu SMS.', back: 'phone' },
    '2fa': { title: 'Verificación en dos pasos', subtitle: 'Tu cuenta tiene contraseña de dos pasos activada.', back: 'code' },
    done: { title: '¡Configuración completa!', subtitle: 'Tu cuenta de Telegram está vinculada. Iniciando TelDrive...' },
  }[step]

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>
        {/* Panel izquierdo — branding */}
        <div style={{
          width: 320, background: 'var(--bg2)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', padding: '48px 32px',
        }}>
          <div className="logo" style={{ marginBottom: 8 }}>Tel<span>Drive</span></div>
          <div className="logo-sub">tu cloud en telegram</div>

          <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)',
                  background: i < stepIndex ? 'var(--accent)' : i === stepIndex ? 'var(--accent)20' : 'var(--bg3)',
                  color: i < stepIndex ? '#fff' : i === stepIndex ? 'var(--accent)' : 'var(--text3)',
                  border: i === stepIndex ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'all .3s',
                }}>
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span style={{
                  fontSize: 13, fontWeight: i === stepIndex ? 600 : 400,
                  color: i === stepIndex ? 'var(--text)' : i < stepIndex ? 'var(--text2)' : 'var(--text3)',
                  transition: 'color .3s',
                }}>{s}</span>
              </div>
            ))}
          </div>

          {/* Guía credenciales siempre visible */}
          <div style={{ marginTop: 'auto', background: 'var(--bg3)', borderRadius: 10, padding: 16, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.9 }}>
            <div style={{ color: 'var(--accent2)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>CÓMO OBTENER TUS CREDENCIALES</div>
            <div>1. Abre{' '}<a href="https://my.telegram.org" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', textDecoration: 'none', borderBottom: '1px solid var(--accent)44' }}>my.telegram.org ↗</a></div>
            <div>2. Inicia sesión con tu número</div>
            <div>3. Click en <strong style={{ color: 'var(--text2)' }}>"API development tools"</strong></div>
            <div>4. Completa el formulario</div>
            <div>5. Copia <strong style={{ color: 'var(--text2)' }}>api_id</strong> y <strong style={{ color: 'var(--text2)' }}>api_hash</strong></div>
          </div>
        </div>

        {/* Panel derecho — formulario */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              {stepContent.back && (
                <button onClick={() => { setStep(stepContent.back); setError('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ← Volver
                </button>
              )}
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{stepContent.title}</h1>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 32, lineHeight: 1.6 }}>{stepContent.subtitle}</p>

            {step === 'credentials' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>APP API ID</label>
                  <input className="modal-input" placeholder="12345678" value={apiId} onChange={e => setApiId(e.target.value)} autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>APP API HASH</label>
                  <input className="modal-input" placeholder="a1b2c3d4e5f6a7b8c9d0..." value={apiHash} onChange={e => setApiHash(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run(async () => { if (!apiId || !apiHash) throw new Error('Completa ambos campos'); await api.setupInit(apiId.trim(), apiHash.trim()); setStep('phone') })} />
                </div>
                {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
                <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '10px 0' }} disabled={loading}
                  onClick={() => run(async () => { if (!apiId || !apiHash) throw new Error('Completa ambos campos'); await api.setupInit(apiId.trim(), apiHash.trim()); setStep('phone') })}>
                  {loading ? <span className="spinner" /> : 'Continuar →'}
                </button>
              </div>
            )}

            {step === 'phone' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>NÚMERO DE TELÉFONO</label>
                  <input className="modal-input" placeholder="+549111234567" value={phone} onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run(async () => { if (!phone) throw new Error('Ingresa tu número'); await api.setupSendCode(phone.trim()); setStep('code') })} autoFocus />
                </div>
                {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
                <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '10px 0' }} disabled={loading}
                  onClick={() => run(async () => { if (!phone) throw new Error('Ingresa tu número'); await api.setupSendCode(phone.trim()); setStep('code') })}>
                  {loading ? <span className="spinner" /> : 'Enviar código →'}
                </button>
              </div>
            )}

            {step === 'code' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>CÓDIGO DE VERIFICACIÓN</label>
                  <input className="modal-input" placeholder="1 2 3 4 5" value={code} onChange={e => setCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run(async () => { if (!code) throw new Error('Ingresa el código'); const r = await api.setupSignIn(code.trim()); if (r.need2fa) setStep('2fa'); else { setStep('done'); setTimeout(onDone, 1500) } })} autoFocus
                    style={{ letterSpacing: 6, fontSize: 20, textAlign: 'center' }} />
                </div>
                {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
                <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '10px 0' }} disabled={loading}
                  onClick={() => run(async () => { if (!code) throw new Error('Ingresa el código'); const r = await api.setupSignIn(code.trim()); if (r.need2fa) setStep('2fa'); else { setStep('done'); setTimeout(onDone, 1500) } })}>
                  {loading ? <span className="spinner" /> : 'Verificar →'}
                </button>
              </div>
            )}

            {step === '2fa' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>CONTRASEÑA</label>
                  <input className="modal-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && run(async () => { if (!password) throw new Error('Ingresa tu contraseña'); await api.setup2fa(password); setStep('done'); setTimeout(onDone, 1500) })} autoFocus />
                </div>
                {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
                <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '10px 0' }} disabled={loading}
                  onClick={() => run(async () => { if (!password) throw new Error('Ingresa tu contraseña'); await api.setup2fa(password); setStep('done'); setTimeout(onDone, 1500) })}>
                  {loading ? <span className="spinner" /> : 'Confirmar →'}
                </button>
              </div>
            )}

            {step === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)20', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>✓</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>Redirigiendo a TelDrive...</div>
                <span className="spinner" style={{ width: 20, height: 20 }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [configured, setConfigured] = useState(null) // null = cargando

  useEffect(() => {
    // ?setup en la URL fuerza mostrar el setup (para probar)
    if (window.location.search.includes('setup')) return setConfigured(false)
    api.setupStatus().then(s => setConfigured(s.configured)).catch(() => setConfigured(true))
  }, [])

  if (configured === null) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  if (!configured) return <SetupScreen onDone={() => {
    window.history.replaceState({}, '', window.location.pathname) // sacar ?setup de la URL
    setConfigured(true)
  }} />

  return <MainApp />
}

function MainApp() {
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [chDragIdx, setChDragIdx] = useState(null)
  const [chDragOver, setChDragOver] = useState(null)

  const [defaultChannelId, setDefaultChannelId] = useState(null)

  function applyChannelOrder(chs, order) {
    if (!order || !order.length) return chs
    return [...chs].sort((a, b) => {
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }
  function saveChannelOrder(chs) {
    api.setPrefs({ 'channel-order': chs.map(c => c.id) }).catch(() => {})
  }
  function handleChDragStart(e, idx) { e.stopPropagation(); setChDragIdx(idx) }
  function handleChDragOver(e, idx) { e.preventDefault(); e.stopPropagation(); setChDragOver(idx) }
  function handleChDrop(e, idx) {
    e.preventDefault(); e.stopPropagation()
    if (chDragIdx === null || chDragIdx === idx) { setChDragIdx(null); setChDragOver(null); return }
    const reordered = [...channels]
    const [moved] = reordered.splice(chDragIdx, 1)
    reordered.splice(idx, 0, moved)
    setChannels(reordered)
    saveChannelOrder(reordered)
    setChDragIdx(null); setChDragOver(null)
  }
  const [currentPath, setCurrentPath] = useState('/')
  const [files, setFiles] = useState([])
  const [filesPage, setFilesPage] = useState(1)
  const [filesHasMore, setFilesHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [folderSize, setFolderSize] = useState(null) // { count, size }
  const FILES_PER_PAGE = 100

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }
  const [tree, setTree] = useState(null)
  const [view, setView] = useState('grid')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [stats, setStats] = useState(null)

  const [showAddChannel, setShowAddChannel] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [channelsSidebarExpanded, setChannelsSidebarExpanded] = useState(false) // collapsed por defecto
  const [treeSidebarVisible, setTreeSidebarVisible] = useState(true)
  const [confirm, setConfirm] = useState(null) // { message, onConfirm }
  const [showCloseDialog, setShowCloseDialog] = useState(false)

  // Escuchar evento de cierre desde Electron
  React.useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.onCloseRequest(() => setShowCloseDialog(true))
  }, [])
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [moveFile, setMoveFile] = useState(null)
  const [renameItem, setRenameItem] = useState(null) // { item, type: 'file'|'folder' }
  const [selected, setSelected] = useState(new Set()) // IDs de archivos seleccionados
  const [selectMode, setSelectMode] = useState(false)

  function toggleSelect(id) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }
  function selectAll() { setSelected(new Set(files.map(f => f.id))) }
  function clearSelection() { setSelected(new Set()); setSelectMode(false) }
  function enterSelectMode(id) {
    setSelectMode(true)
    setSelected(new Set([id]))
  }
  const [previewFile, setPreviewFile] = useState(null)
  const [indexing, setIndexing] = useState({})
  const [syncing, setSyncing] = useState({})
  const [lastSync, setLastSync] = useState({})
  const [dragOver, setDragOver] = useState(null) // null | 'content' | folder path

  // Load channels & stats
  useEffect(() => {
    Promise.all([api.getChannels(), api.getPrefs()]).then(([chs, prefs]) => {
      const order = prefs['channel-order'] || []
      const defaultId = prefs['default-channel'] ? parseInt(prefs['default-channel']) : null
      setDefaultChannelId(defaultId)
      const ordered = applyChannelOrder(chs, order)
      setChannels(ordered)
      if (!ordered.length) return
      if (ordered.length === 1) { selectChannel(ordered[0]); return }
      if (defaultId) {
        const found = ordered.find(c => c.id === defaultId)
        if (found) selectChannel(found)
      }
    }).catch(() => {})
    api.getStats().then(setStats).catch(() => {})

    // Restaurar sesiones de descarga activas al recargar
    api.downloadSessionsActive().then(sessions => {
      sessions.forEach(s => {
        const transferId = addTransfer({
          type: 'download',
          name: s.name,
          progress: s.status === 'ready' ? 100 : 0,
          speed: 0,
          status: s.status === 'ready' ? 'done' : 'downloading',
          total: s.size || 0,
        })

        if (s.status === 'ready') {
          // Ya listo — solo mostrar toast, no agregar al panel
          removeTransfer(transferId)
          toast(`"${s.name}" ya está listo — haz click en descargar`, 'info')
        } else {
          // En progreso — reconectar SSE
          const sse = new EventSource(api.downloadProgressUrl(s.jobId))
          sse.onmessage = (e) => {
            const d = JSON.parse(e.data)
            updateTransfer(transferId, { progress: d.progress, speed: d.speed, status: 'downloading', part: d.part, partTotal: d.partTotal })
            if (d.status === 'ready') {
              sse.close()
              updateTransfer(transferId, { status: 'done', progress: 100, speed: 0 })
              removeTransfer(transferId)
              toast(`"${s.name}" listo para descargar`, 'success')
            }
            if (d.status === 'error') { sse.close(); updateTransfer(transferId, { status: 'error' }); removeTransfer(transferId) }
          }
          sse.onerror = () => sse.close()
        }
      })
    }).catch(() => {})
  }, [])

  // Load files when channel/path changes
  useEffect(() => {
    if (!activeChannel) return
    setLoading(true)
    setSearchResults(null)
    setSearchQ('')
    setFilesPage(1)
    setSelected(new Set())
    Promise.all([
      api.getFiles({ channel_id: activeChannel.id, path: currentPath, limit: FILES_PER_PAGE, page: 1, sort: sortBy, dir: sortDir }),
      tree ? Promise.resolve(null) : api.getTree(activeChannel.id),
      api.getFolderSize(activeChannel.id, currentPath),
    ]).then(([fileRes, treeRes, sizeRes]) => {
      const fetched = fileRes.files || []
      setFiles(fetched)
      setFilesHasMore(fetched.length === FILES_PER_PAGE)
      setFolderSize(sizeRes)
      if (treeRes) setTree(treeRes)
    }).then(() => setLoading(false)).catch(e => { toast(e.message, 'error'); setLoading(false) })
  }, [activeChannel, currentPath, refreshKey, sortBy, sortDir])

  // Search
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults(null); return }
    const t = setTimeout(async () => {
      try {
        const res = await api.search(searchQ, activeChannel?.id)
        setSearchResults(res)
      } catch {}
    }, 350)
    return () => clearTimeout(t)
  }, [searchQ, activeChannel])

  function selectChannel(ch) {
    setActiveChannel(ch)
    setCurrentPath('/')
    setTree(null)
    setFiles([])
    setRefreshKey(k => k + 1)
    // Auto-pull manifest en background
    setSyncing(s => ({ ...s, [ch.id]: true }))
    api.pullManifest(ch.id).then(result => {
      if (result && result.imported > 0) {
        setRefreshKey(k => k + 1)
        api.getTree(ch.id).then(setTree).catch(() => {})
      }
      setLastSync(ls => ({ ...ls, [ch.id]: new Date().toLocaleTimeString() }))
      setSyncing(s => ({ ...s, [ch.id]: false }))
    }).catch(() => {
      setSyncing(s => ({ ...s, [ch.id]: false }))
    })
  }

  async function handleSync(ch, e) {
    e.stopPropagation()
    setSyncing(s => ({ ...s, [ch.id]: true }))
    try {
      const result = await api.pullManifest(ch.id)
      const msg = result && result.imported > 0
        ? 'Sync: ' + result.imported + ' archivos nuevos'
        : 'Ya estaba actualizado'
      toast(msg, 'success')
      setLastSync(ls => ({ ...ls, [ch.id]: new Date().toLocaleTimeString() }))
      if (activeChannel?.id === ch.id) {
        setRefreshKey(k => k + 1)
        api.getTree(ch.id).then(setTree).catch(() => {})
      }
    } catch (e) { toast(e.message, 'error') }
    finally { setSyncing(s => ({ ...s, [ch.id]: false })) }
  }


  async function handleDeleteSelected() {
    const ids = [...selected]
    setConfirm({
      message: `¿Eliminar ${ids.length} archivo${ids.length > 1 ? 's' : ''}?`,
      onConfirm: async () => {
        for (const id of ids) {
          try { await api.deleteFile(id) } catch (_) {}
        }
        clearSelection()
        toast(`${ids.length} archivo${ids.length > 1 ? 's' : ''} eliminado${ids.length > 1 ? 's' : ''}`, 'success')
        setRefreshKey(k => k + 1)
      }
    })
  }

  function handleMoveSelected() {
    const firstFile = files.find(f => selected.has(f.id))
    if (!firstFile) return
    setMoveFile({ ...firstFile, _bulkIds: [...selected] })
  }

  function handleMove(file) { setMoveFile(file) }
  function handlePreview(file) { if (file.type === 'image' || file.type === 'video') setPreviewFile(file) }
  function handleRenameFile(file) { setRenameItem({ item: file, type: 'file' }) }
  function handleRenameFolder(folder) { setRenameItem({ item: folder, type: 'folder' }) }

  async function handleLoadMore() {
    if (loadingMore || !filesHasMore) return
    setLoadingMore(true)
    const nextPage = filesPage + 1
    try {
      const res = await api.getFiles({ channel_id: activeChannel.id, path: currentPath, limit: FILES_PER_PAGE, page: nextPage, sort: sortBy, dir: sortDir })
      const fetched = res.files || []
      setFiles(prev => [...prev, ...fetched])
      setFilesPage(nextPage)
      setFilesHasMore(fetched.length === FILES_PER_PAGE)
    } catch (e) { toast(e.message, 'error') }
    finally { setLoadingMore(false) }
  }

  async function handleDeleteFolder(folder) {
    setConfirm({
      message: `¿Eliminar la carpeta "${folder.name}" y todo su contenido?`,
      onConfirm: async () => {
        try {
          await api.deleteFolder(folder.id, activeChannel.id, folder.path)
          toast(`Carpeta eliminada: ${folder.name}`, 'success')
          api.getTree(activeChannel.id).then(setTree).catch(() => {})
          setRefreshKey(k => k + 1)
        } catch (err) {
          toast('Error al eliminar: ' + err.message, 'error')
        }
      }
    })
  }

  async function handleDelete(file) {
    setConfirm({
      message: `¿Eliminar "${file.name}"?`,
      onConfirm: async () => {
        try {
          await api.deleteFile(file.id)
          toast(`Eliminado: ${file.name}`, 'success')
          setRefreshKey(k => k + 1)
        } catch (err) {
          toast('Error al eliminar: ' + err.message, 'error')
        }
      }
    })
  }

  async function handleDragMove(fileId, targetPath) {
    try {
      await api.moveFile(fileId, targetPath)
      toast('Movido a ' + targetPath, 'success')
      setRefreshKey(k => k + 1)
      if (activeChannel) api.getTree(activeChannel.id).then(setTree).catch(() => {})
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Recorre un FileSystemDirectoryEntry y devuelve [{ file, relativePath }]
  async function readDirEntry(entry, prefix = '') {
    return new Promise(resolve => {
      const reader = entry.createReader()
      const results = []
      const readBatch = () => {
        reader.readEntries(async entries => {
          if (!entries.length) return resolve(results)
          for (const e of entries) {
            if (e.isFile) {
              const file = await new Promise(r => e.file(r))
              results.push({ file, relativePath: prefix + e.name })
            } else if (e.isDirectory) {
              const nested = await readDirEntry(e, prefix + e.name + '/')
              results.push(...nested)
            }
          }
          readBatch()
        })
      }
      readBatch()
    })
  }

  async function handleDropUpload(files, targetPath, dataTransferItems) {
    if (!activeChannel) return

    // Intentar leer carpetas via FileSystemEntry API
    const entries = dataTransferItems
      ? Array.from(dataTransferItems).map(i => i.webkitGetAsEntry?.()).filter(Boolean)
      : []

    const folderEntries = entries.filter(e => e.isDirectory)

    if (folderEntries.length) {
      // Modo carpeta(s)
      for (const dirEntry of folderEntries) {
        const allFiles = await readDirEntry(dirEntry, dirEntry.name + '/')
        if (!allFiles.length) continue
        const total = allFiles.length
        const base = targetPath.endsWith('/') ? targetPath : targetPath + '/'
        const batchId = addTransfer({ type: 'upload', name: `📁 ${dirEntry.name} (${total})`, progress: 0, speed: 0, status: 'uploading', part: 0, partTotal: total })

        // Crear subcarpetas
        const uniqueDirs = [...new Set(allFiles.map(({ relativePath }) => {
          const parts = relativePath.split('/'); parts.pop(); return parts.join('/')
        }).filter(Boolean))]
        for (const dir of uniqueDirs) {
          const segments = dir.split('/')
          let accumulated = base
          for (const seg of segments) {
            if (!seg) continue
            try { await api.createFolder(activeChannel.id, accumulated, seg) } catch (_) {}
            accumulated += seg + '/'
          }
        }

        // Subir archivos
        let done = 0
        for (const { file, relativePath } of allFiles) {
          const parts = relativePath.split('/'); parts.pop()
          const destPath = base + (parts.length ? parts.join('/') + '/' : '')
          const jobId = crypto.randomUUID()
          updateTransfer(batchId, { name: `📁 ${dirEntry.name} ${done}/${total}`, part: done, partTotal: total, progress: Math.round(done / total * 100) })
          const sse = new EventSource(api.uploadProgressUrl(jobId))
          sse.onmessage = e => { const d = JSON.parse(e.data); if (d.status === 'done' || d.status === 'error') sse.close() }
          try {
            const result = await api.upload(activeChannel.id, destPath, file, jobId)
            if (result.error) throw new Error(result.error)
          } catch (e) { toast(`Error: ${file.name}`, 'error') }
          done++
        }
        updateTransfer(batchId, { status: 'done', progress: 100 })
        removeTransfer(batchId)
        toast(`📁 ${dirEntry.name} subida — ${total} archivos`, 'success')
        api.getTree(activeChannel.id).then(setTree).catch(() => {})
        setRefreshKey(k => k + 1)
      }
      return
    }

    // Modo archivos sueltos (comportamiento original)
    const fileList = files && files.length ? Array.from(files)
      : entries.filter(e => e.isFile).map(e => new Promise(r => e.file(r)))
    const resolved = await Promise.all(fileList.length ? fileList.map(f => f instanceof File ? f : f) : [])
    resolved.forEach(file => {
      const jobId = crypto.randomUUID()
      const transferId = addTransfer({ type: 'upload', name: file.name, progress: 0, speed: 0, status: 'uploading', part: 1, partTotal: 1 })
      const sse = new EventSource(api.uploadProgressUrl(jobId))
      sse.onmessage = (e) => {
        const d = JSON.parse(e.data)
        updateTransfer(transferId, { progress: d.progress, speed: d.speed, status: d.status, part: d.part, partTotal: d.partTotal })
        if (d.status === 'done' || d.status === 'error') sse.close()
      }
      api.upload(activeChannel.id, targetPath, file, jobId)
        .then(result => {
          if (result.error) throw new Error(result.error)
          updateTransfer(transferId, { status: 'done', progress: 100, speed: 0 })
          removeTransfer(transferId)
          toast('Subido: ' + file.name, 'success')
          setRefreshKey(k => k + 1)
        })
        .catch(e => { sse.close(); updateTransfer(transferId, { status: 'error' }); removeTransfer(transferId); toast('Error: ' + e.message, 'error') })
    })
  }

  async function handleIndex(ch, e) {
    e.stopPropagation()
    setIndexing(i => ({ ...i, [ch.id]: true }))
    try {
      const res = await api.indexChannel(ch.id)
      toast('Indexado: ' + res.indexed + ' nuevos archivos', 'success')
      if (activeChannel?.id === ch.id) {
        const [fileRes, treeRes] = await Promise.all([
          api.getFiles({ channel_id: ch.id, path: currentPath, limit: FILES_PER_PAGE, page: 1 }),
          api.getTree(ch.id),
        ])
        const fetched = fileRes.files || []
        setFiles(fetched)
        setFilesPage(1)
        setFilesHasMore(fetched.length === FILES_PER_PAGE)
        setTree(treeRes)
      }
      const updated = await api.getChannels()
      setChannels(updated)
    } catch (e) { toast(e.message, 'error') }
    finally { setIndexing(i => ({ ...i, [ch.id]: false })) }
  }

  async function handleDeleteChannel(ch, e) {
    e.stopPropagation()
    setConfirm({
      message: `¿Eliminar el canal "${ch.name}" y todos sus archivos del índice?`,
      onConfirm: async () => {
        try {
          await api.deleteChannel(ch.id)
          setChannels(cs => cs.filter(c => c.id !== ch.id))
          if (activeChannel?.id === ch.id) { setActiveChannel(null); setFiles([]); setTree(null) }
          toast('Canal eliminado', 'success')
        } catch (err) { toast(err.message, 'error') }
      }
    })
  }

  async function handleDownload(file) {
    const fileName = file.part_name || file.name
    const transferId = addTransfer({ type: 'download', name: fileName, progress: 0, speed: 0, status: 'downloading', total: file.size || 0 })

    try {
      // Paso 1: verificar si ya hay sesión activa para este archivo
      const session = await api.downloadSession(file.id)

      if (session.status === 'ready') {
        // Ya descargado — servir directo
        updateTransfer(transferId, { status: 'done', progress: 100, speed: 0 })
        removeTransfer(transferId)
        const a = document.createElement('a')
        a.href = api.downloadServeUrl(session.jobId)
        a.download = fileName
        a.click()
        return
      }

      if (session.status === 'preparing') {
        // Ya en progreso — reconectar al SSE existente sin iniciar otro
        toast(`Ya se está preparando "${fileName}", reconectando...`, 'info')
        var jobId = session.jobId
      } else {
        // Paso 2: iniciar preparación nueva
        const prepared = await api.downloadPrepare(file.id)
        var jobId = prepared.jobId
      }

      // Paso 3: seguir progreso por SSE mientras descarga de Telegram a disco
      await new Promise((resolve, reject) => {
        const sse = new EventSource(api.downloadProgressUrl(jobId))
        sse.onmessage = (e) => {
          const d = JSON.parse(e.data)
          updateTransfer(transferId, { progress: d.progress, speed: d.speed, status: 'downloading', part: d.part, partTotal: d.partTotal })
          if (d.status === 'ready') { sse.close(); resolve() }
          if (d.status === 'error') { sse.close(); reject(new Error(d.error || 'Error al preparar')) }
        }
        sse.onerror = () => { sse.close(); reject(new Error('Conexión SSE perdida')) }
      })

      // Paso 4: descargar desde disco local (soporta Range, puede resumir)
      updateTransfer(transferId, { progress: 100, status: 'done', speed: 0 })
      removeTransfer(transferId)
      const a = document.createElement('a')
      a.href = api.downloadServeUrl(jobId)
      a.download = fileName
      a.click()

    } catch (e) {
      updateTransfer(transferId, { status: 'error' })
      removeTransfer(transferId)
      toast('Error: ' + e.message, 'error')
    }
  }

  const breadcrumbs = ['/', ...currentPath.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean)]
  const subfolders = tree ? getFolderChildren(tree, currentPath) : []
  const displayFiles = searchResults !== null ? searchResults : files

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* Sidebar */}
        {/* ── Sidebar canales ── */}
        <div className={`sidebar-channels ${channelsSidebarExpanded ? 'expanded' : 'collapsed'}`}>
          {channelsSidebarExpanded ? (
            <>
              <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 10px 10px' }}>
                <div>
                  <div className="logo" style={{ fontSize: 15 }}>Tel<span>Drive</span></div>
                  <div className="logo-sub">tu cloud en telegram</div>
                </div>
                <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex' }}
                  title="Colapsar" onClick={() => setChannelsSidebarExpanded(false)}>
                  <Icon d={icons.chevronR} size={14} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                <div className="sidebar-section">
                  <div className="sidebar-label">Canales</div>
                  <div className="channel-cards">
                    {channels.map((ch, idx) => {
                      const isActive = activeChannel && activeChannel.id === ch.id
                      return (
                        <div key={ch.id}
                          className={'channel-card' + (isActive ? ' active' : '') + (chDragOver === idx && chDragIdx !== idx ? ' drag-over' : '')}
                          draggable
                          onDragStart={e => handleChDragStart(e, idx)}
                          onDragOver={e => handleChDragOver(e, idx)}
                          onDragLeave={e => { e.stopPropagation(); setChDragOver(null) }}
                          onDrop={e => handleChDrop(e, idx)}
                          onDragEnd={() => { setChDragIdx(null); setChDragOver(null) }}
                          onClick={() => selectChannel(ch)}>
                          <ChannelAvatar channel={ch} active={isActive} />
                          <div className="ch-info">
                            <div className="ch-name">{ch.name}</div>
                            <div className="ch-meta">{ch.file_count} archivos · {formatSize(ch.total_size)}</div>
                          </div>
                          <div className="ch-actions">
                            {channels.length > 1 && (
                              <button className="btn btn-icon" style={{ ...ICON_BTN, color: defaultChannelId === ch.id ? '#f59e0b' : 'var(--text3)' }}
                                title={defaultChannelId === ch.id ? 'Inicio (quitar)' : 'Marcar como inicio'}
                                onClick={e => { e.stopPropagation(); const next = defaultChannelId === ch.id ? null : ch.id; setDefaultChannelId(next); api.setPrefs({ 'default-channel': next }).catch(() => {}) }}>
                                {defaultChannelId === ch.id ? '★' : '☆'}
                              </button>
                            )}
                            <button className="btn btn-icon" style={{ ...ICON_BTN, color: 'var(--accent2)' }}
                              title="Sincronizar" onClick={e => handleSync(ch, e)}>
                              {syncing[ch.id] ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Icon d={icons.sync} size={12} />}
                            </button>
                            <button className="btn btn-icon" style={{ ...ICON_BTN, color: 'var(--text3)' }}
                              title="Re-indexar" onClick={e => handleIndex(ch, e)}>
                              {indexing[ch.id] ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Icon d={icons.refresh} size={12} />}
                            </button>
                            <button className="btn btn-icon" style={{ ...ICON_BTN, color: 'var(--danger)' }}
                              onClick={e => handleDeleteChannel(ch, e)}>
                              <Icon d={icons.trash} size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button className="btn-add-channel" onClick={() => setShowAddChannel(true)}>
                    <Icon d={icons.plus} size={14} /> Agregar canal
                  </button>
                </div>
              </div>
              <div className="sidebar-footer">
                {stats && (
                  <div className="stats-mini">
                    <div>{stats.channels} canales</div>
                    <div>{stats.files?.toLocaleString()} archivos</div>
                    <div>{formatSize(stats.total_size)}</div>
                  </div>
                )}
              </div>
            </>
          ) : (
            // Modo collapsed — solo avatares circulares
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 0 }}>
              {/* Logo mini + toggle */}
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 10px', color: 'var(--accent2)', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}
                title="Expandir canales" onClick={() => setChannelsSidebarExpanded(true)}>
                T
              </button>
              <div className="ch-collapsed">
                {channels.map((ch, idx) => {
                  const isActive = activeChannel && activeChannel.id === ch.id
                  return (
                    <div key={ch.id} className="ch-collapsed-avatar"
                      draggable onDragStart={e => handleChDragStart(e, idx)}
                      onDragOver={e => handleChDragOver(e, idx)}
                      onDragLeave={e => { e.stopPropagation(); setChDragOver(null) }}
                      onDrop={e => handleChDrop(e, idx)}
                      onDragEnd={() => { setChDragIdx(null); setChDragOver(null) }}
                      onClick={() => selectChannel(ch)}
                      title={ch.name}>
                      <ChannelAvatar channel={ch} active={isActive} size={38} />
                    </div>
                  )
                })}
                <div className="ch-add-circle" title="Agregar canal" onClick={() => setShowAddChannel(true)}>+</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar árbol ── */}
        <div className={`sidebar-tree-panel ${treeSidebarVisible ? 'visible' : 'hidden'}`}>
          {treeSidebarVisible && (
            <>
              <div style={{ padding: '12px 10px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1.5px', fontFamily: 'var(--mono)' }}>
                  {activeChannel ? activeChannel.name : 'Carpetas'}
                </span>
                <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
                  title="Ocultar árbol" onClick={() => setTreeSidebarVisible(false)}>
                  <Icon d={icons.chevronR} size={12} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeChannel && tree
                  ? <div className="folder-tree"><FolderTreeNode node={tree} currentPath={currentPath} onNavigate={setCurrentPath} /></div>
                  : <div style={{ padding: 16, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>Sin canal activo</div>
                }
              </div>
            </>
          )}
        </div>

        {/* Main */}
        <main className="main">
          <div className="topbar">
            {/* Breadcrumb */}
            <div className="breadcrumb">
              {activeChannel && (
                <>
                  <span className="breadcrumb-item" title="Inicio" onClick={() => {
                    if (defaultChannelId) {
                      const def = channels.find(c => c.id === defaultChannelId)
                      if (def) { selectChannel(def); return }
                    }
                    setActiveChannel(null); setFiles([]); setTree(null); setCurrentPath('/')
                  }}>
                    <Icon d={icons.home} size={14} />
                  </span>
                  <span className="breadcrumb-sep"><Icon d={icons.chevronR} size={12} /></span>
                  <span className="breadcrumb-item" onClick={() => setCurrentPath('/')}>{activeChannel.name}</span>
                  {breadcrumbs.slice(1).map((seg, i) => {
                    const path = '/' + breadcrumbs.slice(1, i + 2).join('/') + '/'
                    const isLast = i === breadcrumbs.length - 2
                    return (
                      <span key={path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="breadcrumb-sep"><Icon d={icons.chevronR} size={12} /></span>
                        <span className={`breadcrumb-item ${isLast ? 'current' : ''}`} onClick={() => setCurrentPath(path)}>{seg}</span>
                      </span>
                    )
                  })}
                </>
              )}
              {!activeChannel && <span style={{ color: 'var(--text3)', fontSize: 13 }}>Selecciona un canal</span>}
              {activeChannel && folderSize && (
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {folderSize.count} archivos · {formatSize(folderSize.size)}
                </span>
              )}
            </div>

            {/* Search */}
            <div className="search-box">
              <Icon d={icons.search} size={14} stroke="var(--text3)" />
              <input placeholder={activeChannel ? 'Buscar en ' + activeChannel.name + '...' : 'Buscar...'}
                value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              {searchQ && <button style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 0, display: 'flex' }} onClick={() => setSearchQ('')}><Icon d={icons.x} size={14} /></button>}
            </div>

            {/* Actions */}
            {activeChannel && (
              <>
                <button className="btn" style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }} onClick={() => setShowNewFolder(true)}>
                  <Icon d={icons.newfolder} size={14} /> Nueva carpeta
                </button>
                <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
                  <Icon d={icons.upload} size={14} /> Subir
                </button>
              </>
            )}

            {activeChannel && (
              <div style={{ display: 'flex', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 1 }}>
                {[['name','Nombre'],['date','Fecha'],['size','Tamaño'],['type','Tipo']].map(([col, label]) => (
                  <button key={col}
                    style={{ padding: '4px 8px', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                      background: sortBy === col ? 'var(--bg2)' : 'none',
                      color: sortBy === col ? 'var(--text)' : 'var(--text3)' }}
                    onClick={() => handleSort(col)}>
                    {label}{sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                ))}
              </div>
            )}

            <div className="view-toggle">
              <button title="Canales" style={{ opacity: channelsSidebarExpanded ? 1 : 0.5 }}
                onClick={() => setChannelsSidebarExpanded(v => !v)}>
                <Icon d={icons.channel} size={15} />
              </button>
              <button title="Árbol de carpetas" style={{ opacity: treeSidebarVisible ? 1 : 0.5 }}
                onClick={() => setTreeSidebarVisible(v => !v)}>
                <Icon d={icons.folder} size={15} />
              </button>
            </div>
            <div className="view-toggle">
              <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}><Icon d={icons.grid} size={15} /></button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><Icon d={icons.list} size={15} /></button>
            </div>
          </div>

          <div
            className={"content" + (dragOver === 'content' ? ' drag-over' : '')}
            onDragOver={e => { if (!activeChannel) return; e.preventDefault(); setDragOver('content') }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null) }}
            onDrop={e => { e.preventDefault(); setDragOver(null); handleDropUpload(e.dataTransfer.files, currentPath, e.dataTransfer.items) }}
          >
            {!activeChannel ? (
              channels.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">📡</div>
                  <h3>Bienvenido a TelDrive</h3>
                  <p>Todavía no tienes ningún canal.<br />Agrega uno desde la barra lateral para empezar.</p>
                  <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowAddChannel(true)}>
                    + Agregar canal
                  </button>
                </div>
              ) : (
                <div className="empty">
                  <div className="empty-icon">📂</div>
                  <h3>Elige un canal</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, minWidth: 260 }}>
                    {channels.map(ch => (
                      <div key={ch.id} className="channel-card" style={{ background: 'var(--bg2)', border: '1px solid var(--border2)' }}
                        onClick={() => selectChannel(ch)}>
                        <ChannelAvatar channel={ch} active={false} />
                        <div className="ch-info">
                          <div className="ch-name">{ch.name}</div>
                          <div className="ch-meta">{ch.file_count} archivos · {formatSize(ch.total_size)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
                <span className="spinner" style={{ width: 32, height: 32 }} />
              </div>
            ) : (
              <>
                {/* Subcarpetas */}
                {!searchResults && subfolders.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>Carpetas</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                      {subfolders.map(f => (
                        <FolderCard
                          key={f.path}
                          folder={f}
                          channelId={activeChannel.id}
                          dragOver={dragOver === f.path}
                          onClick={() => setCurrentPath(f.path)}
                          onDelete={handleDeleteFolder}
                          onRename={handleRenameFolder}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(f.path) }}
                          onDragLeave={e => { e.stopPropagation(); setDragOver(null) }}
                          onDrop={e => {
                            e.preventDefault(); e.stopPropagation(); setDragOver(null)
                            const fileId = e.dataTransfer.getData('teldrive-file-id')
                            if (fileId) { handleDragMove(parseInt(fileId), f.path) }
                            else { handleDropUpload(e.dataTransfer.files, f.path, e.dataTransfer.items) }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Barra de selección múltiple */}
                {selected.size > 0 && (
                  <div className="selection-bar">
                    <span>{selected.size} seleccionado{selected.size > 1 ? 's' : ''}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleMoveSelected}>
                      <Icon d={icons.move} size={13} /> Mover
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger, #ef4444)' }} onClick={handleDeleteSelected}>
                      <Icon d={icons.trash} size={13} /> Eliminar
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={clearSelection}>✕</button>
                  </div>
                )}

                {/* Archivos */}
                {displayFiles.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">📭</div>
                    <h3>{searchResults !== null ? 'Sin resultados' : 'Carpeta vacía'}</h3>
                    <p>{searchResults !== null ? 'Probá con otro término.' : 'No hay archivos indexados en esta carpeta.\nSube algo o re-indexa el canal.'}</p>
                  </div>
                ) : view === 'grid' ? (
                  <>
                    {displayFiles.length > 50 ? (
                      <VirtualGrid
                        items={displayFiles}
                        itemWidth={160}
                        itemHeight={210}
                        gap={12}
                        renderItem={f => <FileCard key={f.id} file={f} view="grid" selected={selected.has(f.id)} onSelect={toggleSelect} selectMode={selectMode} onEnterSelect={enterSelectMode} onDownload={handleDownload} onMove={handleMove} onDelete={handleDelete} onRename={handleRenameFile} onPreview={handlePreview} />}
                      />
                    ) : (
                    <div className="file-grid">
                      {displayFiles.map(f => <FileCard key={f.id} file={f} view="grid" selected={selected.has(f.id)} onSelect={toggleSelect} selectMode={selectMode} onEnterSelect={enterSelectMode} onDownload={handleDownload} onMove={handleMove} onDelete={handleDelete} onRename={handleRenameFile} onPreview={handlePreview} />)}
                    </div>
                    )}
                    {filesHasMore && searchResults === null && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <button className="btn" style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text3)', minWidth: 140 }} onClick={handleLoadMore} disabled={loadingMore}>
                          {loadingMore ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Cargar más'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="file-list">
                      <div className="file-row" style={{ color: 'var(--text3)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'default' }}>
                        <span />
                        <span>Nombre</span>
                        <span style={{ textAlign: 'right' }}>Tamaño</span>
                        <span style={{ textAlign: 'right' }}>Fecha</span>
                        <span />
                      </div>
                      {displayFiles.map(f => <FileCard key={f.id} file={f} view="list" selected={selected.has(f.id)} onSelect={toggleSelect} selectMode={selectMode} onEnterSelect={enterSelectMode} onDownload={handleDownload} onMove={handleMove} onDelete={handleDelete} onRename={handleRenameFile} />)}
                    </div>
                    {filesHasMore && searchResults === null && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <button className="btn" style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text3)', minWidth: 140 }} onClick={handleLoadMore} disabled={loadingMore}>
                          {loadingMore ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Cargar más'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      {showAddChannel && (
        <AddChannelModal
          onClose={() => setShowAddChannel(false)}
          onAdd={ch => setChannels(cs => [...cs, ch])}
        />
      )}
      {previewFile && (
        <Lightbox file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
      {moveFile && activeChannel && (
        <MoveModal
          file={moveFile}
          tree={tree}
          onClose={() => setMoveFile(null)}
          onMoved={() => { setMoveFile(null); setRefreshKey(k => k + 1); api.getTree(activeChannel.id).then(setTree).catch(() => {}) }}
        />
      )}
      {showNewFolder && activeChannel && (
        <NewFolderModal
          channel={activeChannel}
          currentPath={currentPath}
          onClose={() => setShowNewFolder(false)}
          onCreated={() => {
            setShowNewFolder(false)
            api.getTree(activeChannel.id).then(setTree)
            setRefreshKey(k => k + 1)
          }}
        />
      )}
      {showUpload && (
        <UploadModal
          channels={channels}
          currentChannel={activeChannel}
          currentPath={currentPath}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { if (activeChannel) api.getTree(activeChannel.id).then(setTree).catch(() => {}); setRefreshKey(k => k + 1) }}
        />
      )}

      {previewFile && <Lightbox file={previewFile} onClose={() => setPreviewFile(null)} />}

      {renameItem && (
        <RenameModal
          item={renameItem.item}
          type={renameItem.type}
          channelId={activeChannel?.id}
          onClose={() => setRenameItem(null)}
          onRenamed={() => {
            setRenameItem(null)
            if (renameItem.type === 'folder') api.getTree(activeChannel.id).then(setTree).catch(() => {})
            setRefreshKey(k => k + 1)
          }}
        />
      )}

      {dragOver && <div className='drop-hint'>Soltar para subir{dragOver !== 'content' ? ' en ' + dragOver : ''}</div>}

      {confirm && (
        <div className="overlay" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🗑️</div>
            <p style={{ textAlign: 'center', color: 'var(--text)', marginBottom: 20, lineHeight: 1.5 }}>{confirm.message}</p>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>Esta acción no se puede deshacer.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger, #ef4444)', color: '#fff' }}
                onClick={() => { confirm.onConfirm(); setConfirm(null) }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseDialog && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🚪</div>
            <h2 style={{ textAlign: 'center', marginBottom: 8 }}>¿Qué querés hacer?</h2>
            <div className="modal-actions" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setShowCloseDialog(false); window.electronAPI?.sendCloseChoice('minimize') }}>
                Minimizar a la barra de tareas
              </button>
              <button className="btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--danger, #ef4444)', color: '#fff' }}
                onClick={() => { setShowCloseDialog(false); window.electronAPI?.sendCloseChoice('quit') }}>
                Cerrar TelDrive
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setShowCloseDialog(false); window.electronAPI?.sendCloseChoice('minimize') }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <TransferPanel />
      <Toasts />
    </>
  )
}
