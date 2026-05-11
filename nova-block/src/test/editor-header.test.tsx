// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditorHeader } from '../components/editor/EditorHeader'

describe('EditorHeader sticker actions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    delete (window as typeof window & { electron?: unknown }).electron
  })

  it('clears stickers through the in-app confirm without using native confirm', async () => {
    const onClearStickers = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    Object.assign(window, {
      electron: {
        ipcInvoke: vi.fn(),
      },
    })

    render(
      <EditorHeader
        icon="📝"
        title="Test note"
        isTitleManuallyEdited={false}
        savePhase="idle"
        isDirty={false}
        lastSavedAt={null}
        showRelations={false}
        showOutline={false}
        viewMode="edit"
        isStickerMode
        backgroundPaper="none"
        onSave={() => {}}
        onUpdateTitle={() => {}}
        onToggleRelations={() => {}}
        onOutlineEnter={() => {}}
        onOutlineLeave={() => {}}
        onSetViewMode={() => {}}
        onToggleStickerMode={() => {}}
        onClearStickers={onClearStickers}
      />,
    )

    fireEvent.click(screen.getByLabelText('clear-stickers'))

    expect(screen.getByTestId('confirm-compat-overlay')).toBeTruthy()
    fireEvent.click(screen.getByTestId('confirm-compat-confirm'))

    await waitFor(() => {
      expect(onClearStickers).toHaveBeenCalledTimes(1)
    })

    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
