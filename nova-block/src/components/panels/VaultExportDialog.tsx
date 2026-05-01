/**
 * v0.19 C1 · Vault Export
 *
 * 一键将当前笔记库导出为独立静态站：
 *   index.html  —— 单文件 SPA，内置搜索、主题切换、目录树
 *   所有正文作为 JSON 嵌入，避免跨文件加载
 *
 * 不依赖外部 CDN；主题色沿用当前 theme tokens。
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Package, CheckCircle2 } from 'lucide-react'
import type { Note } from '../../lib/types'

interface Props {
  notes: Note[]
  isOpen: boolean
  onClose: () => void
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c])
}

function buildStaticSite(notes: Note[]): string {
  const exportable = notes
    .filter(n => !n.is_folder)
    .map((n) => ({
      id: n.id,
      title: n.title || '未命名',
      content: n.content ?? '',
      tags: n.tags ?? [],
      updated: n.updated_at ?? '',
    }))

  const json = JSON.stringify(exportable).replace(/</g, '\\u003c')
  const title = '我的笔记 · Nova Export'

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #f6f1e6; --fg: #2a2416; --subtle: #7a6f5a;
    --accent: #9b2d20; --surface: #fffaf0; --border: #d8ceb7;
  }
  html[data-theme="dark"] {
    --bg: #14120d; --fg: #ebe4d1; --subtle: #8a8371;
    --accent: #cf6a5a; --surface: #1e1a12; --border: #2a251a;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.7 ui-serif, Georgia, "Noto Serif SC", serif; background: var(--bg); color: var(--fg); }
  .app { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
  aside { border-right: 1px solid var(--border); background: var(--surface); padding: 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .brand { font-weight: 700; font-size: 14px; letter-spacing: .04em; margin-bottom: 8px; }
  .search { width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); font-size: 13px; outline: none; margin-bottom: 10px; }
  .nav { list-style: none; padding: 0; margin: 0; }
  .nav li { cursor: pointer; padding: 5px 6px; border-radius: 4px; font-size: 13px; color: var(--fg); }
  .nav li:hover { background: var(--border); }
  .nav li.active { background: var(--accent); color: var(--surface); }
  main { padding: 40px 56px; max-width: 860px; margin: 0 auto; }
  h1, h2, h3 { font-family: ui-serif, "Noto Serif SC", serif; color: var(--fg); }
  main h1 { font-size: 28px; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 20px; }
  main img, main video { max-width: 100%; border-radius: 6px; }
  code { background: var(--surface); padding: 2px 5px; border-radius: 3px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; }
  pre { background: var(--surface); padding: 12px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
  blockquote { border-left: 3px solid var(--accent); padding: 2px 14px; color: var(--subtle); margin: 14px 0; }
  .tag { display: inline-block; padding: 1px 7px; margin: 0 4px 4px 0; border: 1px solid var(--border); border-radius: 9px; font-size: 11px; color: var(--subtle); }
  .meta { font-size: 11px; color: var(--subtle); margin-bottom: 14px; }
  .toolbar { position: fixed; top: 12px; right: 18px; display: flex; gap: 6px; }
  .toolbar button { border: 1px solid var(--border); background: var(--surface); color: var(--fg); padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  @media (max-width: 720px) { .app { grid-template-columns: 1fr; } aside { position: relative; height: auto; } main { padding: 20px; } }
</style>
</head>
<body>
<div class="toolbar"><button id="tgl">切换主题</button></div>
<div class="app">
  <aside>
    <div class="brand">${escapeHtml(title)}</div>
    <input class="search" id="q" placeholder="搜索 · 标题/正文" />
    <ul class="nav" id="nav"></ul>
  </aside>
  <main id="main">选择左侧笔记开始阅读</main>
</div>
<script>
  const NOTES = ${json};
  const nav = document.getElementById('nav');
  const main = document.getElementById('main');
  const q = document.getElementById('q');
  let filtered = NOTES.slice();
  let current = null;

  function render() {
    nav.innerHTML = '';
    for (const n of filtered) {
      const li = document.createElement('li');
      li.textContent = n.title;
      li.dataset.id = n.id;
      if (current && current.id === n.id) li.classList.add('active');
      li.onclick = () => open(n);
      nav.appendChild(li);
    }
  }
  function open(n) {
    current = n;
    main.innerHTML =
      '<h1>' + escape(n.title) + '</h1>' +
      '<div class="meta">' + (n.updated || '') + (n.tags || []).map(t => '<span class="tag">#' + escape(t) + '</span>').join(' ') + '</div>' +
      (n.content || '');
    render();
  }
  function escape(s) { return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
  q.oninput = () => {
    const s = q.value.trim().toLowerCase();
    filtered = !s ? NOTES.slice() : NOTES.filter(n => (n.title + ' ' + n.content).toLowerCase().includes(s));
    render();
  };
  document.getElementById('tgl').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const nxt = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nxt);
    localStorage.setItem('nv-export-theme', nxt);
  };
  const saved = localStorage.getItem('nv-export-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  if (NOTES.length > 0) open(NOTES[0]);
  render();
</script>
</body></html>`
}

export function VaultExportDialog({ notes, isOpen, onClose }: Props) {
  const [progress, setProgress] = useState<'idle' | 'building' | 'ready'>('idle')
  const [blobUrl, setBlobUrl] = useState<string>('')

  const eligible = useMemo(() => notes.filter(n => !n.is_folder).length, [notes])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  const onBuild = async () => {
    setProgress('building')
    // async to avoid blocking large vaults
    await new Promise(r => setTimeout(r, 80))
    const html = buildStaticSite(notes)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    setProgress('ready')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="nv-panel-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="nv-panel-shell nv-panel-shell-sm"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nv-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Package size={16} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>导出为静态站点</div>
                  <div style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)' }}>
                    将 {eligible} 篇笔记打包为单个 HTML · 内置搜索与主题切换
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="nv-panel-close"><X size={14} /></button>
            </header>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="nv-export-status" data-status={progress}>
                {progress === 'idle' && (
                  <>
                    <Package size={32} style={{ opacity: 0.4 }} />
                    <div style={{ fontSize: 13, color: 'var(--nv-color-fg-muted)' }}>
                      点击"构建"生成可离线浏览的 HTML
                    </div>
                  </>
                )}
                {progress === 'building' && (
                  <>
                    <div className="nv-export-spinner" />
                    <div style={{ fontSize: 13 }}>正在拼装笔记…</div>
                  </>
                )}
                {progress === 'ready' && (
                  <>
                    <CheckCircle2 size={32} style={{ color: 'var(--nv-color-success)' }} />
                    <div style={{ fontSize: 13 }}>构建完成 · 可下载</div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="nv-panel-pill" onClick={onBuild} disabled={progress === 'building'}>
                  {progress === 'ready' ? '重新构建' : '构建'}
                </button>
                {progress === 'ready' && blobUrl && (
                  <a
                    className="nv-panel-pill nv-panel-pill-primary"
                    href={blobUrl}
                    download="nova-vault.html"
                  >
                    <Download size={12} /> 下载 HTML
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default VaultExportDialog
