/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'

import { collectAttachmentInventory, summarizeAttachmentInventory } from '../lib/attachmentInventory'

describe('attachment inventory', () => {
  it('collects file-card, image, audio and video attachments from note html', () => {
    const html = [
      '<p>before</p>',
      '<div data-type="file-card" src="/api/media/static/files/a.pdf" name="a.pdf" size="1024" type="application/pdf"></div>',
      '<img src="/api/media/static/files/photo.png" alt="photo" />',
      '<video src="/api/media/static/files/demo.mp4"></video>',
      '<audio src="/api/media/static/files/demo.mp3"></audio>',
    ].join('')

    const items = collectAttachmentInventory(html)
    const summary = summarizeAttachmentInventory(items)

    expect(items).toHaveLength(4)
    expect(items.map((item) => item.kind)).toEqual(['document', 'image', 'video', 'audio'])
    expect(summary.total).toBe(4)
    expect(summary.byKind.document).toBe(1)
    expect(summary.totalBytes).toBe(1024)
  })

  it('deduplicates attachments by kind and source', () => {
    const html = [
      '<div data-type="file-card" src="/api/media/static/files/a.pdf" name="a.pdf"></div>',
      '<div data-type="file-card" src="/api/media/static/files/a.pdf" name="a.pdf"></div>',
    ].join('')

    expect(collectAttachmentInventory(html)).toHaveLength(1)
  })
})
