import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '../..')
const novaBlockEditor = readFileSync(resolve(projectRoot, 'src/components/novablock/NovaBlockEditor.tsx'), 'utf-8')
const headingView = readFileSync(resolve(projectRoot, 'src/components/novablock/extensions/HeadingView.tsx'), 'utf-8')

describe('QingZhi editor surface contract', () => {
  it('wraps the editor canvas in QingZhi paper chrome with artwork and semantic regions', () => {
    const requiredMarkers = [
      'data-testid="qingzhi-editor-toprail"',
      'data-testid="qingzhi-editor-main-scroll"',
      'data-testid="qingzhi-editor-scroll"',
      'data-testid="qingzhi-editor-paper-shell"',
      'data-testid="qingzhi-editor-art-screen"',
      'data-testid="qingzhi-editor-property-card"',
      'data-testid="qingzhi-editor-writing-surface"',
      'qz-editor-paper-shell',
      'qz-editor-art-screen',
      'qz-editor-property-card',
      'qz-editor-writing-surface',
      'qz-editor-content-layer',
      '/assets/qingzhi/uploaded/illustration-decoration.webp',
    ]

    for (const marker of requiredMarkers) {
      expect(novaBlockEditor, `${marker} should be present`).toContain(marker)
    }
  })

  it('keeps the top toolbar rail outside the scrolling main column so it can stay above the toc', () => {
    const toprailIndex = novaBlockEditor.indexOf('data-testid="qingzhi-editor-toprail"')
    const mainColumnIndex = novaBlockEditor.indexOf('qz-editor-main-column')
    const tocIndex = novaBlockEditor.indexOf('<TableOfContents')

    expect(toprailIndex).toBeGreaterThan(-1)
    expect(mainColumnIndex).toBeGreaterThan(-1)
    expect(tocIndex).toBeGreaterThan(-1)
    expect(toprailIndex).toBeLessThan(mainColumnIndex)
    expect(toprailIndex).toBeLessThan(tocIndex)
  })

  it('locks the drag handle while the pointer crosses the left block gutter', () => {
    expect(novaBlockEditor).toContain('handleWritingSurfaceMouseMove')
    expect(novaBlockEditor).toContain('handleWritingSurfaceMouseLeave')
    expect(novaBlockEditor).toContain('data-qz-handle-bridge')
    expect(novaBlockEditor).toContain('onMouseMoveCapture={handleWritingSurfaceMouseMove}')
    expect(novaBlockEditor).toContain('data-testid="qingzhi-block-handle"')
    expect(novaBlockEditor).toContain('className="qz-custom-block-handle"')
    expect(novaBlockEditor).toContain('shouldKeepDragHandlePositionOnNodeLoss')
    expect(novaBlockEditor).toContain('dragHandleBridgeLockedRef.current = locked')
    expect(novaBlockEditor).not.toContain("editor.view.dispatch(editor.state.tr.setMeta('lockDragHandle', locked))")
  })

  it('uses a custom QingZhi block handle overlay instead of the Tiptap drag handle visual plugin', () => {
    expect(novaBlockEditor).toContain('getQingZhiBlockHandleRect')
    expect(novaBlockEditor).toContain('blockHandleState')
    expect(novaBlockEditor).toContain('createPortal(')
    expect(novaBlockEditor).not.toContain("import QingZhiDragHandle from './QingZhiDragHandle'")
    expect(novaBlockEditor).not.toContain('<QingZhiDragHandle')
  })

  it('keeps the custom QingZhi block handle draggable instead of only opening the block menu', () => {
    expect(novaBlockEditor).toContain('draggable={true}')
    expect(novaBlockEditor).toContain('onDragStart={handleGripDragStart}')
    expect(novaBlockEditor).toContain('onDragEnd={handleGripDragEnd}')
    expect(novaBlockEditor).toContain('editor.view.dragging')
  })

  it('marks heading wrappers and fold toggles explicitly for stable QingZhi gutters', () => {
    expect(headingView).toContain('data-qz-heading-wrapper="true"')
    expect(headingView).toContain('data-fold-toggle="true"')
  })

  it('does not reuse the generic drag-handle class on the inner grip icon', () => {
    expect(novaBlockEditor).toContain('qz-custom-block-handle-icon')
    expect(novaBlockEditor).not.toContain('transition-colors drag-handle')
  })

  it('keeps the full note title editable and separate from the body editor content', () => {
    expect(novaBlockEditor).toContain('data-testid="qingzhi-note-title-input"')
    expect(novaBlockEditor).toContain('commitNoteTitle')
    expect(novaBlockEditor).toContain('stripLeadingDuplicateTitleBlockFromHtml')
    expect(novaBlockEditor).not.toContain('extractLeadingNoteTitle')
  })

  it('enables nested block detection for rich QingZhi node views', () => {
    expect(novaBlockEditor).toContain('getDragHandleTargetPosFromElement')
    expect(novaBlockEditor).toContain('getDragHandleTargetPosFromPoint')
  })

  it('tracks block rows from the full editor paper area instead of only text content', () => {
    const paperShellIndex = novaBlockEditor.indexOf('data-testid="qingzhi-editor-paper-shell"')
    const writingSurfaceIndex = novaBlockEditor.indexOf('data-testid="qingzhi-editor-writing-surface"')
    const paperShellChunk = novaBlockEditor.slice(paperShellIndex, writingSurfaceIndex)

    expect(paperShellIndex).toBeGreaterThan(-1)
    expect(writingSurfaceIndex).toBeGreaterThan(paperShellIndex)
    expect(paperShellChunk).toContain('onMouseMoveCapture={handleWritingSurfaceMouseMove}')
    expect(paperShellChunk).toContain('onMouseLeave={handleWritingSurfaceMouseLeave}')
  })
})
