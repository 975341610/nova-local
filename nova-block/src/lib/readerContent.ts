/**
 * Reader Mode 内容渲染器
 *
 * Nova 的笔记 content 可能是：
 *   1. Tiptap HTML（已是 HTML 片段）
 *   2. Markdown 纯文本
 *   3. Canvas JSON（不会进入 Reader）
 *
 * 这里做一层轻量转换 + XSS 过滤 + 小组件静态化，
 * 确保 Reader 能安全地用 dangerouslySetInnerHTML 渲染。
 *
 * v0.19.4：
 *   - DOMPurify 放行 data-* 属性，避免 NodeView 标记被剥掉导致"阅读模式下小组件不显示"
 *   - 针对 todoWidget / kanban / countdown / miniCalendar / musicPlayer / habitTracker / timeline
 *     在阅读模式下渲染静态只读视图
 */

import DOMPurify from 'dompurify'

function looksLikeHtml(text: string): boolean {
  const sample = text.slice(0, 200).toLowerCase()
  return /^\s*<(p|h[1-6]|ul|ol|div|blockquote|pre|table|figure|img)/i.test(sample)
}

function lightMarkdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/)
  const out: string[] = []
  let inCode = false
  let inList: 'ul' | 'ol' | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join(' ')}</p>`)
      para = []
    }
  }
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`)
      inList = null
    }
  }

  for (const raw of lines) {
    const line = raw

    if (line.trim().startsWith('```')) {
      flushPara()
      closeList()
      if (!inCode) {
        const lang = line.trim().slice(3).trim()
        out.push(`<pre><code class="language-${escapeHtml(lang)}">`)
        inCode = true
      } else {
        out.push(`</code></pre>`)
        inCode = false
      }
      continue
    }
    if (inCode) {
      out.push(escapeHtml(line))
      continue
    }

    if (!line.trim()) {
      flushPara()
      closeList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushPara()
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`)
      continue
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flushPara()
      if (inList !== 'ul') {
        closeList()
        out.push('<ul>')
        inList = 'ul'
      }
      out.push(`<li>${inlineMd(bullet[1])}</li>`)
      continue
    }

    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ordered) {
      flushPara()
      if (inList !== 'ol') {
        closeList()
        out.push('<ol>')
        inList = 'ol'
      }
      out.push(`<li>${inlineMd(ordered[1])}</li>`)
      continue
    }

    if (line.startsWith('> ')) {
      flushPara()
      closeList()
      out.push(`<blockquote>${inlineMd(line.slice(2))}</blockquote>`)
      continue
    }

    para.push(inlineMd(line))
  }

  flushPara()
  closeList()
  if (inCode) out.push('</code></pre>')
  return out.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMd(s: string): string {
  let out = escapeHtml(s)
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text, url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  )
  return out
}

/* ========== v0.19.4 · Reader 小组件静态化渲染器 ========== */

interface TodoTaskLite { id: string; content: string; completed: boolean }
interface TodoListLite { id: string; title: string; tasks: TodoTaskLite[] }

function readTodoLists(): TodoListLite[] {
  try {
    const raw = localStorage.getItem('nova_todo_lists')
    if (!raw) return []
    return JSON.parse(raw) as TodoListLite[]
  } catch {
    return []
  }
}

function renderTodoWidget(el: Element): string {
  const listId = el.getAttribute('data-list-id') || ''
  const lists = readTodoLists()
  const list = lists.find(l => l.id === listId) || lists[0]
  if (!list) {
    return staticWidget('任务清单', '<p style="opacity:0.7;">暂无任务清单数据。</p>')
  }
  const items = list.tasks
    .map(t => `<li class="${t.completed ? 'done' : ''}">${t.completed ? '☑' : '☐'} ${escapeHtml(t.content)}</li>`)
    .join('')
  return staticWidget(
    `任务 · ${escapeHtml(list.title || '清单')}`,
    `<ul>${items || '<li style="opacity:0.7;">（空）</li>'}</ul>`,
  )
}

function renderKanban(el: Element): string {
  let columns: Array<{ title: string; cards?: Array<{ content?: string; text?: string }> }> = []
  try {
    columns = JSON.parse(el.getAttribute('data-columns') || '[]')
  } catch { /* noop */ }
  if (!Array.isArray(columns) || columns.length === 0) {
    return staticWidget('看板', '<p style="opacity:0.7;">（空看板）</p>')
  }
  const cols = columns.map(col => {
    const cards = (col.cards || [])
      .map(c => `<li>• ${escapeHtml(c.content ?? c.text ?? '')}</li>`)
      .join('')
    return `<div class="nv-rw-kanban-col">
      <h4>${escapeHtml(col.title || '未命名')}</h4>
      <ul>${cards || '<li style="opacity:0.6;">（空）</li>'}</ul>
    </div>`
  }).join('')
  return staticWidget('看板', `<div class="nv-rw-kanban">${cols}</div>`)
}

function renderCountdown(el: Element): string {
  const target = el.getAttribute('data-target-date') || ''
  const title = el.getAttribute('data-title') || '倒计时'
  let days = ''
  if (target) {
    const d = new Date(target)
    if (!isNaN(d.getTime())) {
      const diff = Math.ceil((d.getTime() - Date.now()) / 86400000)
      days = diff >= 0 ? `还剩 ${diff} 天` : `已过 ${Math.abs(diff)} 天`
    }
  }
  return staticWidget(
    '倒计时',
    `<div><strong>${escapeHtml(title)}</strong>${target ? ` · ${escapeHtml(target)}` : ''}${days ? ` · ${days}` : ''}</div>`,
  )
}

function renderMiniCalendar(): string {
  const today = new Date()
  const label = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return staticWidget('迷你日历', `<div>今日 · ${label}</div>`)
}

function renderMusicPlayer(): string {
  return staticWidget('音乐', '<p style="opacity:0.75;">（阅读模式下已折叠音乐组件）</p>')
}

function renderHabitTracker(): string {
  return staticWidget('习惯追踪', '<p style="opacity:0.75;">请切回编辑模式查看习惯打卡。</p>')
}

function renderTimeline(el: Element): string {
  const items = Array.from(el.querySelectorAll('[data-timeline-item]'))
  if (items.length === 0) {
    return staticWidget('时间线', '<p style="opacity:0.7;">（空时间线）</p>')
  }
  const rows = items.map(it => {
    const date = it.getAttribute('data-date') || '—'
    const text = (it.querySelector('.timeline-text')?.textContent ?? it.textContent ?? '').trim()
    return `<div class="nv-rw-timeline-row">
      <span class="nv-rw-timeline-date">${escapeHtml(date)}</span>
      <span>${escapeHtml(text)}</span>
    </div>`
  }).join('')
  return staticWidget('时间线', `<div class="nv-rw-timeline">${rows}</div>`)
}

/** v0.19.5 · 图片轮播组件(slider)静态网格渲染。 */
function renderSlider(el: Element): string {
  let images: string[] = []
  try {
    const raw = el.getAttribute('data-images') || '[]'
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) images = parsed.filter(x => typeof x === 'string')
  } catch { /* noop */ }
  if (images.length === 0) {
    return staticWidget('图片轮播', '<p style="opacity:0.7;">（没有图片）</p>')
  }
  const tiles = images
    .map(src => `<div class="nv-rw-slider-tile"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></div>`)
    .join('')
  return staticWidget('图片轮播', `<div class="nv-rw-slider">${tiles}</div>`)
}

function staticWidget(title: string, bodyHtml: string): string {
  return `<div data-reader-widget="true">
    <div class="nv-rw-title">${escapeHtml(title)}</div>
    ${bodyHtml}
  </div>`
}

/**
 * 在 DOMPurify 之前跑一遍 DOM 转换，把小组件 NodeView 占位符换成
 * 可以在阅读模式下安全渲染的静态视图。
 */
function transformWidgets(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  const replace = (selector: string, builder: (el: Element) => string) => {
    doc.body.querySelectorAll(selector).forEach(el => {
      const wrapper = doc.createElement('div')
      wrapper.innerHTML = builder(el)
      el.replaceWith(...Array.from(wrapper.childNodes))
    })
  }

  replace('div[data-type="todo-widget"]', renderTodoWidget)
  replace('div[data-type="kanban"]', renderKanban)
  replace('div[data-type="countdown"]', renderCountdown)
  replace('div[data-type="mini-calendar"]', renderMiniCalendar)
  replace('div[data-type="music-player"]', renderMusicPlayer)
  replace('div[data-type="habit-tracker"]', renderHabitTracker)
  replace('div[data-timeline="true"]', renderTimeline)
  replace('div[data-type="slider"]', renderSlider)

  return doc.body.innerHTML
}

export function renderReaderHtml(rawContent: string): string {
  if (!rawContent || !rawContent.trim()) {
    return '<p style="color: var(--nv-color-fg-subtle); font-style: italic;">这篇笔记还没有内容。</p>'
  }

  const trimmed = rawContent.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && (parsed.nodes || parsed.viewport)) {
        return '<p style="color: var(--nv-color-fg-subtle);">此笔记为 Canvas 画布,请在主编辑器中打开。</p>'
      }
    } catch {
      // fall through
    }
  }

  const html = looksLikeHtml(trimmed) ? trimmed : lightMarkdownToHtml(trimmed)
  const widgetized = transformWidgets(html)

  return DOMPurify.sanitize(widgetized, {
    ADD_ATTR: [
      'target', 'rel',
      'data-reader-widget',
      'data-checked', 'data-type',
      'data-list-id', 'data-columns',
      'data-target-date', 'data-title', 'data-show-bubble',
      'data-timeline', 'data-timeline-item', 'data-date',
      'data-images', 'data-upload-id',
      'data-list-style',
      // v0.19.5 · video / audio 播放控件
      'controls', 'muted', 'playsinline', 'autoplay', 'loop', 'preload', 'poster',
      'allow', 'allowfullscreen', 'referrerpolicy', 'loading',
    ],
    ADD_TAGS: ['figure', 'figcaption', 'video', 'audio', 'source', 'track', 'iframe'],
  })
}
