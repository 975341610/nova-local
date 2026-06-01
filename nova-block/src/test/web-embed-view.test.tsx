/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebEmbedView } from '../components/web/WebEmbedView'

vi.mock('../lib/api', () => ({
  api: {
    openUrl: vi.fn(),
    previewImportUrls: vi.fn().mockResolvedValue({ items: [] }),
  },
}))

const makeProps = (url: string, viewMode = 'preview') => ({
  node: {
    attrs: {
      url,
      title: '',
      viewMode,
    },
  },
  updateAttributes: vi.fn(),
  selected: false,
  decorations: [],
  innerDecorations: [],
  editor: {} as any,
  extension: {} as any,
  getPos: () => 0,
  HTMLAttributes: {},
  deleteNode: vi.fn(),
} as any)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('WebEmbedView', () => {
  it('tries every site in an iframe before falling back', () => {
    vi.useFakeTimers()
    render(<WebEmbedView {...makeProps('https://github.com/975341610/nova-local')} />)

    expect(screen.queryByText('此网站不允许内嵌预览')).toBeNull()
    expect(document.querySelector('iframe[src="https://github.com/975341610/nova-local"]')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(6500)
    })

    expect(screen.queryByText('此网站不允许内嵌预览')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(14000)
    })

    expect(screen.getByText('此网站不允许内嵌预览')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '在浏览器中打开' }).length).toBeGreaterThan(0)
  })

  it('falls back from a generic blank iframe after the full timeout', () => {
    vi.useFakeTimers()
    render(<WebEmbedView {...makeProps('https://example.com/post')} />)

    expect(screen.queryByText('此网站不允许内嵌预览')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(6500)
    })

    expect(screen.queryByText('此网站不允许内嵌预览')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(14000)
    })

    expect(screen.getByText('此网站不允许内嵌预览')).toBeTruthy()
  })

  it('does not fall back after the iframe load event fires', () => {
    vi.useFakeTimers()
    render(<WebEmbedView {...makeProps('https://example.com/post')} />)

    const iframe = document.querySelector('iframe[src="https://example.com/post"]') as HTMLIFrameElement
    act(() => {
      iframe.dispatchEvent(new Event('load'))
      vi.advanceTimersByTime(25000)
    })

    expect(screen.queryByText('此网站不允许内嵌预览')).toBeNull()
  })

  it('shows a loading indicator until the iframe load event fires', () => {
    vi.useFakeTimers()
    render(<WebEmbedView {...makeProps('https://example.com/post')} />)

    expect(screen.getByText('正在加载网页预览...')).toBeTruthy()

    const iframe = document.querySelector('iframe[src="https://example.com/post"]') as HTMLIFrameElement
    act(() => {
      iframe.dispatchEvent(new Event('load'))
    })

    expect(screen.queryByText('正在加载网页预览...')).toBeNull()
  })

  it('reloads the preview iframe from the toolbar refresh button', () => {
    vi.useFakeTimers()
    render(<WebEmbedView {...makeProps('https://example.com/post')} />)

    const before = document.querySelector('iframe[src="https://example.com/post"]') as HTMLIFrameElement
    act(() => {
      before.dispatchEvent(new Event('load'))
    })
    expect(screen.queryByText('正在加载网页预览...')).toBeNull()

    fireEvent.click(screen.getByTitle('刷新网页'))

    const after = document.querySelector('iframe[src="https://example.com/post"]') as HTMLIFrameElement
    expect(after).not.toBe(before)
    expect(screen.getByText('正在加载网页预览...')).toBeTruthy()
  })
})
