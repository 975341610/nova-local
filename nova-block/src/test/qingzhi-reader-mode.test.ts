import { describe, expect, it } from 'vitest'

import { removeDuplicateReaderTitle } from '../components/reader/ReaderMode'

describe('QingZhi reader mode', () => {
  it('removes the first content heading when it duplicates the reader header title', () => {
    const html = '<h1 id="same">素材生成汇总</h1><h2>核心元素</h2><p>正文</p>'

    expect(removeDuplicateReaderTitle(html, '素材生成汇总')).toBe('<h2>核心元素</h2><p>正文</p>')
  })

  it('keeps the first content heading when it is a real section title', () => {
    const html = '<h1>核心元素</h1><p>正文</p>'

    expect(removeDuplicateReaderTitle(html, '素材生成汇总')).toBe(html)
  })
})
