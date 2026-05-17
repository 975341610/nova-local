// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TableOfContents } from '../components/novablock/components/TableOfContents'

describe('QingZhi right TOC', () => {
  afterEach(() => {
    cleanup()
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
})
