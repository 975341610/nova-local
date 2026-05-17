import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '../..')
const indexCss = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf-8')
const themesCss = readFileSync(resolve(projectRoot, 'src/styles/themes.css'), 'utf-8')
const refineCss = readFileSync(resolve(projectRoot, 'src/styles/qingzhi-refine-v34.css'), 'utf-8')
const css = `${indexCss}\n${themesCss}\n${refineCss}`

const requiredMarkers = [
  '[data-nv-theme="qingzhi"]',
  '--qz-jade',
  '--qz-gold',
  '--qz-mascot-opacity',
  '--qz-texture-opacity',
  '.qz-app-shell',
  '.qz-topbar',
  '.qz-topbar-drag',
  '.qz-topbar-status',
  '.qz-topbar-status-chip',
  '.qz-topbar-runtime-panel',
  '.qz-dot-matrix',
  '.qz-logo-toggle',
  '.qz-topbar-pin',
  '.qz-topbar-pin-icon',
  '.qz-topbar-pin-label',
  '.qz-topbar-more',
  '.qz-editor-layout-toc-collapsed',
  '.qz-settings-selected-zone',
  '.qz-settings-candidate-grid',
  '.qz-sidebar',
  '.qz-sidebar::before',
  '.qz-mascot-backdrop',
  '.qz-sidebar-header',
  '.qz-sidebar-tab-strip',
  '.qz-sidebar-tab',
  '.qz-sidebar-quick-search',
  '.qz-sidebar-section-title',
  '.qz-sidebar-footer-settings',
  '.qz-tree-node-item',
  '.qz-tree-node-item[data-selected="true"]',
  '.qz-tree-node-disclosure',
  '.qz-tree-node-icon',
  '.qz-tree-node-menu',
  '.qz-editorbar',
  '.qz-editor-frame',
  '.qz-editor-shell-grid',
  '.qz-editor-toolbar-row',
  '.qz-editor-gutter-shell',
  '.qz-editor-body-column',
  '.qz-editor-main-column',
  '.qz-editor-actions',
  '.qz-editor-paper-shell',
  '.qz-editor-art-screen',
  '.qz-editor-property-card',
  '.qz-editor-writing-surface',
  '.qz-editor-writing-surface .novablock-editor',
  '.qz-editor-writing-surface .novablock-editor h1',
  '.qz-editor-writing-surface .novablock-editor h2',
  '.qz-editor-writing-surface .novablock-editor blockquote',
  '.qz-editor-writing-surface .novablock-editor ul[data-type="taskList"] li',
  '.qz-editor-writing-surface .novablock-editor ul[data-type="taskList"] input[type="checkbox"]',
  '.qz-editor-writing-surface .novablock-editor .tiptap-drag-handle',
  '.qz-editor-writing-surface .novablock-editor .callout-block',
  '.qz-editor-writing-surface .novablock-editor .callout-icon',
  '.qz-editor-writing-surface .novablock-editor pre',
  '.qz-editor-writing-surface .novablock-editor code',
  '.qz-editor-writing-surface .novablock-editor table',
  '.qz-editor-writing-surface .novablock-editor th',
  '.qz-editor-writing-surface .novablock-editor td',
  '.qz-editor-writing-surface .novablock-editor [data-highlight-block]',
  '.qz-editor-writing-surface .novablock-editor blockquote[data-ai-source-card]',
  '.qz-editor-writing-surface .novablock-editor figure[data-ai-source-card]',
  '.qz-editor-writing-surface .novablock-editor img',
  '.qz-editor-writing-surface .novablock-editor [data-type="column-group"]',
  '.qz-editor-writing-surface .novablock-editor [data-type="column"]',
  '.qz-editor-writing-surface .novablock-editor .math-block',
  '.qz-editor-writing-surface .novablock-editor .math-inline',
  '.qz-editor-content-layer',
  '.qz-right-toc',
  '.qz-right-toc-shell',
  '.qz-right-toc-list::-webkit-scrollbar',
  '.qz-empty-state',
  '.qz-pinned-zone',
  '.qz-quick-actions',
  '.qz-quick-actions::before',
  '.qz-quick-action',
  '.qz-quick-action[data-active="true"]',
]

describe('QingZhi CSS contract', () => {
  it('defines the QingZhi tokens and real app shell selectors', () => {
    for (const marker of requiredMarkers) {
      expect(css, `${marker} should be present`).toContain(marker)
    }
  })

  it('keeps mascot opacity and logo interactivity wired through final override CSS', () => {
    expect(css).toContain('opacity: var(--qz-mascot-opacity)')
    expect(css).toContain('.qz-logo-toggle,')
    expect(css).toContain('.qz-logo-toggle *')
    expect(css).toContain('-webkit-app-region: no-drag')
  })

  it('does not pull list items into the block-handle gutter', () => {
    expect(refineCss).not.toContain(':is(ul, ol, [data-type="taskList"]) > li')
  })

  it('keeps the QingZhi TOC flush to the toolbar and hides item strokes while expanded', () => {
    expect(refineCss).toContain('.qz-right-toc:not(.qz-right-toc-collapsed) .qz-right-toc-item-line')
    expect(refineCss).toContain('margin-top: 0 !important;')
    expect(refineCss).not.toContain('margin-top: 54px !important;')
  })

  it('does not force the floating drag handle back into document flow', () => {
    expect(refineCss).toContain('.qz-custom-block-handle')
    expect(refineCss).not.toContain('.qz-editor-writing-surface .drag-handle {\r\n  position: relative !important;')
    expect(refineCss).not.toContain('.qz-editor-writing-surface .drag-handle {\n  position: relative !important;')
  })

  it('keeps the floating block handle close to the text edge with a compact click target', () => {
    expect(refineCss).toContain('width: 32px !important;')
    expect(refineCss).toContain('height: 32px !important;')
    expect(refineCss).toContain('justify-content: center !important;')
    expect(refineCss).not.toContain('width: 46px !important;')
    expect(refineCss).not.toContain('margin-left: -18px !important;')
  })

  it('does not create the block-handle lane by moving rich content blocks', () => {
    expect(refineCss).not.toContain('margin-left: calc(var(--qz-block-handle-gutter) * -1) !important;')
    expect(refineCss).not.toContain('padding-left: var(--qz-block-handle-gutter) !important;')
    expect(refineCss).not.toContain('v41 unified content axis')
    expect(refineCss).not.toMatch(/>\s*:is\([\s\S]*\[data-highlight-block\][\s\S]*\.timeline-block[\s\S]*padding-left:\s*0\s*!important/)
    expect(refineCss).toContain('v41 isolated block-handle lane')
  })

  it('separates the QingZhi grip icon from legacy drag-handle selectors and marks heading fold controls', () => {
    expect(refineCss).toContain('.qz-custom-block-handle .qz-custom-block-handle-icon')
    expect(refineCss).toContain('[data-qz-heading-wrapper="true"]')
    expect(refineCss).toContain('[data-fold-toggle="true"]')
    expect(refineCss).toContain('pointer-events: auto !important;')
  })

  it('keeps the separate QingZhi note title editable without hiding the first body heading', () => {
    expect(refineCss).toContain('.qz-note-title-input')
    expect(refineCss).not.toContain('.qz-editor-writing-surface .novablock-editor > h1:first-child')
  })

  it('keeps one QingZhi content axis without clearing component padding', () => {
    expect(refineCss).toContain('--qz-block-handle-lane: 52px;')
    expect(refineCss).toContain('/* content axis owns the writing gutter; the editor body must not double-indent */')
    expect(refineCss).toContain('padding: 0 0 128px 0 !important;')
    expect(refineCss).toContain('blockquote[data-ai-source-card]')
    expect(refineCss).not.toMatch(/\[data-highlight-block\][\s\S]{0,180}padding-left:\s*0\s*!important/)
    expect(refineCss).not.toMatch(/\.callout-block[\s\S]{0,180}padding-left:\s*0\s*!important/)
    expect(refineCss).not.toMatch(/\.timeline-block[\s\S]{0,180}padding-left:\s*0\s*!important/)
  })

  it('uses the QingZhi quote card style requested for blockquotes', () => {
    expect(refineCss).toContain('border-left: 4px solid rgba(128,168,156,.92) !important;')
    expect(refineCss).toContain('background: rgba(220,229,222,.72) !important;')
    expect(refineCss).toContain('font-style: italic !important;')
  })
})
