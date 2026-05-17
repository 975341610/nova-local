function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function decodeBasicEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function htmlFragmentToText(fragment: string) {
  return normalizeText(
    decodeBasicEntities(
      fragment
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, ''),
    ),
  )
}

export function stripLeadingDuplicateTitleBlockFromHtml(html: string, noteTitle: string | null | undefined) {
  const title = normalizeText(noteTitle ?? '')
  if (!title) {
    return html
  }

  const leadingWhitespace = /^\s*/.exec(html)?.[0] ?? ''
  const rest = html.slice(leadingWhitespace.length)
  const match = /^<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i.exec(rest)
  if (!match) {
    return html
  }

  const headingText = htmlFragmentToText(match[1])
  if (headingText !== title) {
    return html
  }

  const stripped = `${leadingWhitespace}${rest.slice(match[0].length)}`.trim()
  return stripped || '<p></p>'
}
