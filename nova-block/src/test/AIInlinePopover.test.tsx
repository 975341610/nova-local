/**
 * @vitest-environment jsdom
 *
 * F3 · AIInlinePopover 契约
 *
 * - open=false / anchor=null 不渲染
 * - open=true 渲染:原文行、3 个 kind 按钮、prompt 输入框、确认/取消
 * - 点击 kind 按钮触发 onRun(kind)
 * - 自定义 prompt + 运行触发 onRun('custom', prompt)
 * - confirm 在 previewText 为空时禁用,有 previewText 时启用
 * - cancel / Esc 触发 onCancel
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AIInlinePopover } from '../components/editor/AIInlinePopover'

const baseProps = {
  open: true,
  anchor: { x: 100, y: 100 },
  originalText: '原文',
  previewText: '',
  loading: false,
  error: null as string | null,
  onRun: vi.fn(),
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AIInlinePopover', () => {
  it('open=false 时不渲染', () => {
    render(<AIInlinePopover {...baseProps} open={false} />)
    expect(screen.queryByTestId('qingzhi-ai-inline-popover')).toBeNull()
  })

  it('anchor=null 时不渲染', () => {
    render(<AIInlinePopover {...baseProps} anchor={null} />)
    expect(screen.queryByTestId('qingzhi-ai-inline-popover')).toBeNull()
  })

  it('open=true 渲染面板与 3 个 kind 按钮', () => {
    render(<AIInlinePopover {...baseProps} />)
    expect(screen.getByTestId('qingzhi-ai-inline-popover')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-ai-action-rewrite')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-ai-action-translate')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-ai-action-convert-to-table')).toBeTruthy()
  })

  it('点 rewrite 触发 onRun(rewrite)', () => {
    const onRun = vi.fn()
    render(<AIInlinePopover {...baseProps} onRun={onRun} />)
    fireEvent.click(screen.getByTestId('qingzhi-ai-action-rewrite'))
    expect(onRun).toHaveBeenCalledWith('rewrite')
  })

  it('自定义 prompt 触发 onRun(custom, text)', () => {
    const onRun = vi.fn()
    render(<AIInlinePopover {...baseProps} onRun={onRun} />)
    const ta = screen.getByTestId('qingzhi-ai-inline-prompt') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '把它写成诗' } })
    fireEvent.click(screen.getByTestId('qingzhi-ai-inline-run-custom'))
    expect(onRun).toHaveBeenCalledWith('custom', '把它写成诗')
  })

  it('previewText 为空时确认按钮禁用', () => {
    render(<AIInlinePopover {...baseProps} previewText="" />)
    const btn = screen.getByTestId('qingzhi-ai-inline-confirm') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('有 previewText 且 !loading 时确认按钮启用', () => {
    render(<AIInlinePopover {...baseProps} previewText="结果" loading={false} />)
    const btn = screen.getByTestId('qingzhi-ai-inline-confirm') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('loading=true 时即使有 previewText 也禁用确认 + 禁用 kind 按钮', () => {
    render(<AIInlinePopover {...baseProps} previewText="生成中" loading />)
    const confirm = screen.getByTestId('qingzhi-ai-inline-confirm') as HTMLButtonElement
    const rewrite = screen.getByTestId('qingzhi-ai-action-rewrite') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(rewrite.disabled).toBe(true)
  })

  it('点 confirm 触发 onConfirm', () => {
    const onConfirm = vi.fn()
    render(<AIInlinePopover {...baseProps} previewText="ok" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByTestId('qingzhi-ai-inline-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('点 cancel / 点 X 触发 onCancel', () => {
    const onCancel = vi.fn()
    render(<AIInlinePopover {...baseProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('qingzhi-ai-inline-cancel'))
    fireEvent.click(screen.getByTestId('qingzhi-ai-inline-close'))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('Esc 键触发 onCancel', () => {
    const onCancel = vi.fn()
    render(<AIInlinePopover {...baseProps} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('error 优先于 previewText 渲染', () => {
    render(<AIInlinePopover {...baseProps} error="boom" previewText="x" />)
    expect(screen.getByTestId('qingzhi-ai-inline-error').textContent).toBe('boom')
  })

  it('面板贴近视口右边时向左翻 (边界防遮挡)', () => {
    // 模拟 viewport 宽 1024,锚点放在 1000 — 应自动左移
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    render(<AIInlinePopover {...baseProps} anchor={{ x: 1000, y: 100 }} />)
    const el = screen.getByTestId('qingzhi-ai-inline-popover') as HTMLDivElement
    const left = parseInt(el.style.left, 10)
    // 360 宽 + 8 边距 → left 不应超过 1024 - 368 = 656
    expect(left).toBeLessThanOrEqual(1024 - 360 - 8)
  })
})
