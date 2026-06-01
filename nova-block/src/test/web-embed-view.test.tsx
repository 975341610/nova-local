/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react'
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
  it('shows the blocked preview fallback for known iframe-blocked sites', () => {
    render(<WebEmbedView {...makeProps('https://github.com/975341610/nova-local')} />)

    expect(screen.getByText('此网站不允许内嵌预览')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '在浏览器中打开' }).length).toBeGreaterThan(0)
  })

  it('falls back from a generic blank iframe after a short timeout', () => {
    vi.useFakeTimers()
    render(<WebEmbedView {...makeProps('https://example.com/post')} />)

    expect(screen.queryByText('此网站不允许内嵌预览')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(6500)
    })

    expect(screen.getByText('此网站不允许内嵌预览')).toBeTruthy()
  })
})
