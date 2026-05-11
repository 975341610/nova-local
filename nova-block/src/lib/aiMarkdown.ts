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
