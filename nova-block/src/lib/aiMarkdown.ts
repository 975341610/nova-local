export function shouldRenderAIMarkdown(text: string): boolean {
  const sample = text.trim()
  if (!sample) return false

  return /(^|\n)\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|```)/.test(sample)
    || /\*\*[^*]+\*\*/.test(sample)
    || /`[^`]+`/.test(sample)
    || /\[[^\]]+\]\([^)]+\)/.test(sample)
    || /\n\s*\n/.test(sample)
}

export function aiMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inCodeBlock = false
  let codeLanguage = ''
  let codeLines: string[] = []

  const closeParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${paragraph.join('<br>')}</p>`)
    paragraph = []
  }

  const closeList = () => {
    if (!listType) return
    out.push(`</${listType}>`)
    listType = null
  }

  const closeCodeBlock = () => {
    out.push(`<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
    inCodeBlock = false
    codeLanguage = ''
    codeLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '')
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        closeCodeBlock()
      } else {
        closeParagraph()
        closeList()
        inCodeBlock = true
        codeLanguage = trimmed.slice(3).trim()
        codeLines = []
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(rawLine)
      continue
    }

    if (!trimmed) {
      closeParagraph()
      closeList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      closeParagraph()
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`)
      continue
    }

    const blockquote = /^>\s+(.*)$/.exec(trimmed)
    if (blockquote) {
      closeParagraph()
      closeList()
      out.push(`<blockquote><p>${inlineMarkdownToHtml(blockquote[1])}</p></blockquote>`)
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      closeParagraph()
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li><p>${inlineMarkdownToHtml(bullet[1])}</p></li>`)
      continue
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed)
    if (ordered) {
      closeParagraph()
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li><p>${inlineMarkdownToHtml(ordered[1])}</p></li>`)
      continue
    }

    closeList()
    paragraph.push(inlineMarkdownToHtml(line))
  }

  closeParagraph()
  closeList()
  if (inCodeBlock) closeCodeBlock()

  return out.join('\n') || `<p>${escapeHtml(markdown)}</p>`
}

export function aiMarkdownToHtmlWithFootnotes(
  markdown: string,
  citations: Array<{ title?: string; excerpt?: string }> = [],
): string {
  const placeholders = new Map<string, string>()
  const prepared = markdown.replace(/(?<!!)\[(\d+)\]/g, (match, rawIndex: string, offset: number) => {
    const index = Number(rawIndex)
    if (!Number.isFinite(index) || index < 1) return match
    const citation = citations[index - 1]
    const content = citation
      ? extractCitationEvidence(markdown, offset, match.length, citation) || `来源：${cleanFootnoteText(citation.title) || `引用 ${index}`}`
      : `AI 引用 ${index}`
    const placeholder = `@@NOVA_AI_FOOTNOTE_${index}@@`
    placeholders.set(
      placeholder,
      `<span data-type="footnote" data-index="${index}" data-content="${escapeAttribute(content)}"></span>`,
    )
    return placeholder
  })
  let html = aiMarkdownToHtml(prepared)
  placeholders.forEach((footnote, placeholder) => {
    html = html.split(placeholder).join(footnote)
  })
  return html
}

function extractCitationEvidence(
  markdown: string,
  markerOffset: number,
  markerLength: number,
  citation: { title?: string; excerpt?: string },
): string {
  const excerpt = cleanFootnoteText(citation.excerpt)
  if (!excerpt) return ''

  const claim = getClaimAroundMarker(markdown, markerOffset, markerLength)
  const terms = getMeaningfulTerms(claim)
  if (!terms.length) return excerpt.slice(0, 160)

  const sentences = excerpt
    .split(/(?<=[。！？!?；;])\s+|[\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const candidates = sentences.length ? sentences : [excerpt]
  let best = ''
  let bestScore = 0
  for (const sentence of candidates) {
    const haystack = sentence.toLocaleLowerCase()
    const score = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = sentence
    }
  }
  if (bestScore > 0 && best) return best.slice(0, 180)

  const haystack = excerpt.toLocaleLowerCase()
  const firstTerm = terms.find((term) => haystack.includes(term))
  if (!firstTerm) return ''
  const index = haystack.indexOf(firstTerm)
  const start = Math.max(0, index - 55)
  const end = Math.min(excerpt.length, index + firstTerm.length + 95)
  return `${start > 0 ? '...' : ''}${excerpt.slice(start, end)}${end < excerpt.length ? '...' : ''}`
}

function getClaimAroundMarker(markdown: string, markerOffset: number, markerLength: number): string {
  const before = markdown.slice(0, markerOffset)
  const after = markdown.slice(markerOffset + markerLength)
  const previousBreak = Math.max(
    before.lastIndexOf('\n'),
    before.lastIndexOf('。'),
    before.lastIndexOf('！'),
    before.lastIndexOf('？'),
    before.lastIndexOf(';'),
    before.lastIndexOf('；'),
  )
  const nextBreakCandidates = ['\n', '。', '！', '？', ';', '；']
    .map((token) => after.indexOf(token))
    .filter((index) => index >= 0)
  const nextBreak = nextBreakCandidates.length ? Math.min(...nextBreakCandidates) : after.length
  return cleanFootnoteText(`${markdown.slice(previousBreak + 1, markerOffset)} ${after.slice(0, nextBreak)}`)
    .replace(/\[\d+\]/g, '')
}

function getMeaningfulTerms(value: string): string[] {
  const stopTerms = new Set([
    '这个', '那个', '因为', '所以', '可以', '用于', '关于', '相关', '内容', '笔记',
    '总结', '生成', '来源', '引用', '信息', '原文', '部分', '为什么', '什么',
  ])
  const text = cleanFootnoteText(value).toLocaleLowerCase()
  const terms = new Set<string>()
  for (const word of text.match(/[a-z0-9_]{3,}/g) || []) {
    terms.add(word)
  }
  for (const run of text.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    if (run.length <= 8 && !stopTerms.has(run)) terms.add(run)
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= run.length - size; index += 1) {
        const term = run.slice(index, index + size)
        if (!stopTerms.has(term)) terms.add(term)
      }
    }
  }
  return [...terms].sort((a, b) => b.length - a.length).slice(0, 24)
}

function cleanFootnoteText(value?: string): string {
  if (!value) return ''
  let text = value
  if (typeof document !== 'undefined') {
    const element = document.createElement('textarea')
    for (let i = 0; i < 3; i += 1) {
      element.innerHTML = text
      const decoded = element.value
      if (decoded === text) break
      text = decoded
    }
  }
  for (let i = 0; i < 3; i += 1) {
    const next = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
    if (next === text) break
    text = next
  }
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/[*_`~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function inlineMarkdownToHtml(value: string): string {
  let out = escapeHtml(value)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, text: string, url: string) => `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  )
  return out
}
