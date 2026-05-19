// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditorHeader } from '../components/editor/EditorHeader'

const baseProps = {
  icon: '知',
  title: '清知测试笔记',
  isTitleManuallyEdited: false,
  breadcrumbs: [],
  savePhase: 'idle' as const,
  isDirty: false,
  lastSavedAt: '17:58',
  showRelations: false,
  showOutline: false,
  showMarginNotes: false,
  viewMode: 'edit' as const,
  isStickerMode: false,
  backgroundPaper: 'none' as const,
  onSelectBreadcrumb: vi.fn(),
  onToggleMarginNotes: vi.fn(),
  onToggleTypewriter: vi.fn(),
  onSave: vi.fn(),
  onUpdateTitle: vi.fn(),
  onToggleRelations: vi.fn(),
  onOutlineEnter: vi.fn(),
  onOutlineLeave: vi.fn(),
  onSetViewMode: vi.fn(),
  onToggleStickerMode: vi.fn(),
  onOpenStickerPanel: vi.fn(),
  onClearStickers: vi.fn(),
  onSaveAsTemplate: vi.fn(),
  onChangeBackgroundPaper: vi.fn(),
  onOpenHistory: vi.fn(),
}

describe('QingZhi EditorHeader toolbar', () => {
  afterEach(() => {
    cleanup()
  })

  it('uses QingZhi editorbar chrome and exposes right-aligned compact actions', () => {
    render(<EditorHeader {...baseProps} />)

    expect(screen.getByTestId('qingzhi-editorbar')).toBeTruthy()
    expect(screen.getByText('清知编辑')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-editor-status')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-editor-actions')).toBeTruthy()

    const requiredActions = [
      'edit-mode',
      'preview-mode',
      'find-replace',
      'typewriter',
      'background-paper',
      'sticker-mode',
      'save-template',
      'save-note',
      'revision-history',
      'margin-notes',
    ]

    for (const action of requiredActions) {
      expect(screen.getByTestId(`qingzhi-editor-action-${action}`)).toBeTruthy()
    }
  })

  it('keeps editorbar actions wired to the existing editor callbacks', () => {
    const onSetViewMode = vi.fn()
    const onToggleTypewriter = vi.fn()
    const onToggleStickerMode = vi.fn()
    const onSave = vi.fn()
    const onOpenHistory = vi.fn()
    const onToggleMarginNotes = vi.fn()

    render(
      <EditorHeader
        {...baseProps}
        onSetViewMode={onSetViewMode}
        onToggleTypewriter={onToggleTypewriter}
        onToggleStickerMode={onToggleStickerMode}
        onSave={onSave}
        onOpenHistory={onOpenHistory}
        onToggleMarginNotes={onToggleMarginNotes}
      />,
    )

    fireEvent.click(screen.getByTestId('qingzhi-editor-action-preview-mode'))
    expect(onSetViewMode).toHaveBeenCalledWith('preview')

    fireEvent.click(screen.getByTestId('qingzhi-editor-action-typewriter'))
    expect(onToggleTypewriter).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('qingzhi-editor-action-sticker-mode'))
    expect(onToggleStickerMode).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('qingzhi-editor-action-save-note'))
    expect(onSave).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('qingzhi-editor-action-revision-history'))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('qingzhi-editor-action-margin-notes'))
    expect(onToggleMarginNotes).toHaveBeenCalledTimes(1)
  })

  it('invokes onToggleFindReplace when find-replace button is clicked', () => {
    const onToggleFindReplace = vi.fn()
    render(<EditorHeader {...baseProps} onToggleFindReplace={onToggleFindReplace} />)
    fireEvent.click(screen.getByTestId('qingzhi-editor-action-find-replace'))
    expect(onToggleFindReplace).toHaveBeenCalledTimes(1)
  })
})
