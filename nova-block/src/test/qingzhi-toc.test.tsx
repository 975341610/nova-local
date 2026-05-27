// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TableOfContents } from '../components/novablock/components/TableOfContents'

describe('QingZhi right TOC', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders as a right-side reserved panel instead of a floating overlay', () => {
    render(
      <TableOfContents
        outline={[
          { id: 'h-intro', text: 'Intro', level: 1 },
          { id: 'h-detail', text: 'Detail', level: 2 },
        ]}
      />,
    )

    const toc = screen.getByTestId('qingzhi-right-toc')
    expect(toc.getAttribute('data-collapsed')).toBe('false')
    expect(toc.getAttribute('class') ?? '').toContain('qz-right-toc')
    expect(toc.getAttribute('class') ?? '').not.toContain('fixed')
    expect(screen.getByText('Intro')).toBeTruthy()
    expect(screen.getByText('Detail')).toBeTruthy()
  })

  it('can collapse without disappearing from the layout', () => {
    render(<TableOfContents outline={[{ id: 'h-intro', text: 'Intro', level: 1 }]} />)

    fireEvent.click(screen.getByTestId('qingzhi-right-toc-toggle'))

    const toc = screen.getByTestId('qingzhi-right-toc')
    expect(toc.getAttribute('data-collapsed')).toBe('true')
    expect(screen.getByTestId('qingzhi-right-toc-toggle')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-right-toc-collapsed-lines')).toBeTruthy()
  })

  it('can be controlled by the editor layout so the reserved column collapses too', () => {
    const onCollapsedChange = vi.fn()
    render(
      <TableOfContents
        outline={[{ id: 'h-intro', text: 'Intro', level: 1 }]}
        isCollapsed={false}
        onCollapsedChange={onCollapsedChange}
      />,
    )

    fireEvent.click(screen.getByTestId('qingzhi-right-toc-toggle'))

    expect(onCollapsedChange).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('qingzhi-right-toc').getAttribute('data-collapsed')).toBe('false')
  })

  it('keeps an empty shell when the note has no headings', () => {
    render(<TableOfContents outline={[]} />)

    expect(screen.getByTestId('qingzhi-right-toc')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-right-toc-empty')).toBeTruthy()
  })

  it('keeps the title and collapse button in one header row without a duplicate chevron', () => {
    render(<TableOfContents outline={[{ id: 'h-intro', text: 'Intro', level: 1 }]} />)

    expect(screen.getByTestId('qingzhi-right-toc-head')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-right-toc-title')).toBeTruthy()
    expect(screen.getAllByTestId('qingzhi-right-toc-toggle')).toHaveLength(1)
  })

  it('recalculates the active item after switching notes without waiting for another scroll', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const firstHeading = document.createElement('h1')
    firstHeading.id = 'h-first'
    firstHeading.getBoundingClientRect = () => ({ top: 120, bottom: 160, left: 0, right: 0, width: 0, height: 40, x: 0, y: 120, toJSON: () => ({}) })
    document.body.appendChild(firstHeading)

    const secondHeading = document.createElement('h1')
    secondHeading.id = 'h-second'
    secondHeading.getBoundingClientRect = () => ({ top: 80, bottom: 120, left: 0, right: 0, width: 0, height: 40, x: 0, y: 80, toJSON: () => ({}) })
    document.body.appendChild(secondHeading)

    const { rerender } = render(<TableOfContents outline={[{ id: 'h-first', text: 'First', level: 1 }]} />)
    rerender(<TableOfContents outline={[{ id: 'h-second', text: 'Second', level: 1 }]} />)

    expect(await screen.findByText('Second')).toBeTruthy()
    expect(screen.getByText('Second').closest('button')?.getAttribute('data-active')).toBe('true')
  })
})
