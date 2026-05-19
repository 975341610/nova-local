/**
 * @vitest-environment jsdom
 *
 * Batch 6 · F3 · AIBubbleActions 组件契约
 *
 * - 渲染三个按钮: rewrite / translate / convert-to-table (带 testid)
 * - 点击按钮触发 onAction(kind)
 * - loading=true 时所有按钮 disabled
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AIBubbleActions } from '../components/novablock/components/AIBubbleActions'

describe('AIBubbleActions', () => {
  afterEach(() => cleanup())

  it('renders three action buttons with stable testids', () => {
    render(<AIBubbleActions onAction={vi.fn()} />)
    expect(screen.getByTestId('qingzhi-ai-action-rewrite')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-ai-action-translate')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-ai-action-convert-to-table')).toBeTruthy()
  })

  it('clicking a button dispatches onAction with the right kind', () => {
    const onAction = vi.fn()
    render(<AIBubbleActions onAction={onAction} />)
    fireEvent.click(screen.getByTestId('qingzhi-ai-action-rewrite'))
    fireEvent.click(screen.getByTestId('qingzhi-ai-action-translate'))
    fireEvent.click(screen.getByTestId('qingzhi-ai-action-convert-to-table'))
    expect(onAction).toHaveBeenCalledTimes(3)
    expect(onAction.mock.calls[0][0]).toBe('rewrite')
    expect(onAction.mock.calls[1][0]).toBe('translate')
    expect(onAction.mock.calls[2][0]).toBe('convert-to-table')
  })

  it('disables all buttons when loading=true', () => {
    render(<AIBubbleActions onAction={vi.fn()} loading />)
    const btn1 = screen.getByTestId('qingzhi-ai-action-rewrite') as HTMLButtonElement
    const btn2 = screen.getByTestId('qingzhi-ai-action-translate') as HTMLButtonElement
    const btn3 = screen.getByTestId('qingzhi-ai-action-convert-to-table') as HTMLButtonElement
    expect(btn1.disabled).toBe(true)
    expect(btn2.disabled).toBe(true)
    expect(btn3.disabled).toBe(true)
  })
})
