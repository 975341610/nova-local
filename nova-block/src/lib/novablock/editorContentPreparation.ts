import { sanitizeLegacyApiUrlsInHtml } from '../api'
import { stripLeadingDuplicateTitleBlockFromHtml } from '../noteContentTitle'

export function prepareEditorContent(content: string | null | undefined, title: string | null | undefined): string {
  const html = sanitizeLegacyApiUrlsInHtml(content) || '<p></p>'
  return stripLeadingDuplicateTitleBlockFromHtml(html, title)
}
