import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node } from '@tiptap/pm/model'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { api } from '../../../lib/api'
import { isSpellcheckFeatureEnabled, SPELLCHECK_SETTINGS_CHANGED_EVENT } from '../../../lib/spellcheckSettings'

export const spellcheckPluginKey = new PluginKey('nova-spellcheck-plugin')
export const SPELLCHECK_SUGGESTION_REQUEST_EVENT = 'nova:spellcheck-suggestion-request'

export interface AISpellcheckOptions {
  debounceMs: number
}

export interface SpellcheckError {
  word: string
  suggestion: string
  reason: string
  from: number
  to: number
  offset?: number
}

export interface SpellcheckTextblockTarget {
  text: string
  rangeFrom: number
  rangeTo: number
  typeName: string
}

type Coords = {
  left: number
  right: number
  top: number
  bottom: number
}

type SpellcheckAction =
  | { type: 'setErrors'; errors: SpellcheckError[] }
  | { type: 'clearAll' }
  | { type: 'removeError'; from: number; to: number }

function buildDecorations(errors: SpellcheckError[]) {
  return errors.map((error) => Decoration.inline(error.from, error.to, {
    class: 'ai-spellcheck-error',
    title: `${error.word} -> ${error.suggestion}${error.reason ? ` (${error.reason})` : ''}`,
    style: 'text-decoration: underline wavy #ef4444; text-decoration-thickness: 1.5px; text-underline-offset: 3px; cursor: pointer;',
  }, {
    inclusiveStart: false,
    inclusiveEnd: false,
  }))
}

export function codePointOffsetToUtf16Offset(text: string, codePointOffset: number) {
  return Array.from(text).slice(0, codePointOffset).join('').length
}

export function resolveTextOffsetToDocPos(
  textblockNode: Pick<Node, 'descendants'> | null | undefined,
  rangeFrom: number,
  utf16Offset: number,
) {
  if (!textblockNode || typeof textblockNode.descendants !== 'function') {
    return rangeFrom + utf16Offset
  }

  let textCursor = 0
  let resolvedPos: number | null = null
  let pendingEndPos: number | null = null

  textblockNode.descendants((node: Node, pos: number) => {
    if (resolvedPos !== null) {
      return false
    }

    if (node.isText) {
      const text = node.text ?? ''
      const nextTextCursor = textCursor + text.length
      if (utf16Offset >= textCursor && utf16Offset < nextTextCursor) {
        resolvedPos = rangeFrom + pos + (utf16Offset - textCursor)
        return false
      }
      if (utf16Offset === nextTextCursor) {
        pendingEndPos = rangeFrom + pos + text.length
      }
      textCursor = nextTextCursor
      return true
    }

    const leafText = node.textContent ?? ''
    if (leafText.length > 0) {
      const nextTextCursor = textCursor + leafText.length
      if (utf16Offset <= nextTextCursor) {
        resolvedPos = rangeFrom + pos + node.nodeSize
        return false
      }
      textCursor = nextTextCursor
    }

    return true
  })

  return resolvedPos ?? pendingEndPos ?? rangeFrom + utf16Offset
}

function getTextblockNode(view: EditorView | null, rangeFrom: number | null | undefined) {
  if (!view || typeof rangeFrom !== 'number') {
    return null
  }

  try {
    const resolved = view.state.doc.resolve(rangeFrom)
    return resolved.parent?.isTextblock ? resolved.parent : null
  } catch (_error) {
    return null
  }
}

export function mapSpellcheckResultsToTextblock(
  view: EditorView | null,
  text: string,
  results: Array<{ word: string; suggestion: string; reason: string; offset: number }>,
  rangeFrom: number,
) {
  const textblockNode = getTextblockNode(view, rangeFrom)
  const rangeTo = textblockNode?.content
    ? rangeFrom + textblockNode.content.size
    : rangeFrom + text.length

  const errors = results.flatMap((result) => {
    const fromOffset = codePointOffsetToUtf16Offset(text, result.offset)
    const toOffset = codePointOffsetToUtf16Offset(text, result.offset + Array.from(result.word).length)
    const wordAtOffset = text.slice(fromOffset, toOffset)
    if (wordAtOffset !== result.word) {
      return []
    }

    return [{
      ...result,
      from: resolveTextOffsetToDocPos(textblockNode, rangeFrom, fromOffset),
      to: resolveTextOffsetToDocPos(textblockNode, rangeFrom, toOffset),
    }]
  })

  return { errors, rangeFrom, rangeTo }
}

export function mergeSpellcheckErrorsForRange(
  existingErrors: SpellcheckError[],
  nextErrors: SpellcheckError[],
  rangeFrom: number,
  rangeTo: number,
) {
  const preserved = existingErrors.filter((error) => error.to <= rangeFrom || error.from >= rangeTo)
  return [...preserved, ...nextErrors].sort((a, b) => a.from - b.from)
}

export function reduceSpellcheckErrorsAfterDocChange(errors: SpellcheckError[], docChanged: boolean) {
  return docChanged ? [] : errors
}

export function findSpellcheckErrorAtDocPos(errors: SpellcheckError[], pos: number | null | undefined) {
  if (typeof pos !== 'number') {
    return null
  }

  return errors.find((error) => pos >= error.from && pos < error.to) ?? null
}

export function getSpellcheckErrorRect(
  error: SpellcheckError,
  coordsAtPos: ((pos: number) => Coords) | null | undefined,
) {
  if (!coordsAtPos) {
    return null
  }

  try {
    const startRect = coordsAtPos(error.from)
    const endRect = coordsAtPos(error.to)
    const left = Math.min(startRect.left, endRect.left)
    const right = Math.max(startRect.right, endRect.right)
    const top = Math.min(startRect.top, endRect.top)
    const bottom = Math.max(startRect.bottom, endRect.bottom)
    return {
      top,
      left,
      right,
      bottom,
      width: Math.max(right - left, 0),
      height: Math.max(bottom - top, 0),
    }
  } catch (_error) {
    return null
  }
}

export function resolveSpellcheckPopupRequest(
  errors: SpellcheckError[],
  pos: number | null | undefined,
  coordsAtPos: ((pos: number) => Coords) | null | undefined,
) {
  const error = findSpellcheckErrorAtDocPos(errors, pos)
  if (!error) {
    return null
  }

  const rect = getSpellcheckErrorRect(error, coordsAtPos)
  return rect ? { error, rect } : null
}

export function collectSpellcheckTextblocks(doc: Node) {
  const blocks: SpellcheckTextblockTarget[] = []

  doc.descendants((node: Node, pos: number) => {
    const text = node.textContent ?? ''
    if (node.isTextblock && text.trim()) {
      blocks.push({
        text,
        rangeFrom: pos + 1,
        rangeTo: pos + node.nodeSize - 1,
        typeName: node.type.name,
      })
    }
    return true
  })

  return blocks
}

export function getSpellcheckTextblockAtPos(doc: Node, pos: number): SpellcheckTextblockTarget | null {
  let matched: SpellcheckTextblockTarget | null = null

  doc.descendants((node: Node, nodePos: number) => {
    const text = node.textContent ?? ''
    if (!node.isTextblock || !text.trim()) {
      return true
    }

    const rangeFrom = nodePos + 1
    const rangeTo = nodePos + node.nodeSize - 1
    if (pos >= rangeFrom && pos <= rangeTo) {
      matched = {
        text,
        rangeFrom,
        rangeTo,
        typeName: node.type.name,
      }
      return false
    }

    return true
  })

  return matched
}

export function getSpellcheckTextblockFromSelection($from: {
  parent?: Pick<Node, 'isTextblock' | 'textContent' | 'type'> & { content?: { size?: number } }
  start: () => number
}): SpellcheckTextblockTarget | null {
  const parent = $from.parent
  const text = parent?.textContent ?? ''
  if (!parent?.isTextblock || !text.trim()) {
    return null
  }

  const rangeFrom = $from.start()
  const contentSize = typeof parent.content?.size === 'number' ? parent.content.size : text.length
  return {
    text,
    rangeFrom,
    rangeTo: rangeFrom + contentSize,
    typeName: parent.type.name,
  }
}

function dispatchPopupRequest(view: EditorView, request: { error: SpellcheckError; rect: ReturnType<typeof getSpellcheckErrorRect> }) {
  view.dom.dispatchEvent(new CustomEvent(SPELLCHECK_SUGGESTION_REQUEST_EVENT, {
    bubbles: true,
    detail: request,
  }))
}

export const AISpellcheck = Extension.create<AISpellcheckOptions>({
  name: 'aiSpellcheck',

  addOptions() {
    return {
      debounceMs: 800,
    }
  },

  addStorage() {
    return {
      errors: [] as SpellcheckError[],
      requestId: 0,
      isDisabled: !isSpellcheckFeatureEnabled(),
      async runCheck(view: EditorView, text: string, rangeFrom?: number | null) {
        this.isDisabled = !isSpellcheckFeatureEnabled()
        if (this.isDisabled || !text.trim() || typeof rangeFrom !== 'number') {
          return
        }

        const requestId = ++this.requestId
        const result = await api.spellcheck(text)
        if (requestId !== this.requestId) {
          return
        }

        const mapped = mapSpellcheckResultsToTextblock(view, text, result.errors || [], rangeFrom)
        this.errors = mergeSpellcheckErrorsForRange(this.errors, mapped.errors, mapped.rangeFrom, mapped.rangeTo)

        const tr = view.state.tr.setMeta(spellcheckPluginKey, {
          type: 'setErrors',
          errors: this.errors,
        } satisfies SpellcheckAction)
        view.dispatch(tr)
      },
    }
  },

  addProseMirrorPlugins() {
    const { options, storage } = this
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    return [
      new Plugin({
        key: spellcheckPluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, oldSet) {
            const action = tr.getMeta(spellcheckPluginKey) as SpellcheckAction | undefined

            if (action?.type === 'setErrors') {
              return DecorationSet.create(tr.doc, buildDecorations(action.errors))
            }

            if (action?.type === 'removeError') {
              storage.errors = storage.errors.filter((error: SpellcheckError) => !(error.from === action.from && error.to === action.to))
              return DecorationSet.create(tr.doc, buildDecorations(storage.errors))
            }

            if (action?.type === 'clearAll') {
              storage.errors = []
              return DecorationSet.empty
            }

            if (tr.docChanged && storage.errors.length > 0) {
              storage.errors = reduceSpellcheckErrorsAfterDocChange(storage.errors, true)
              return DecorationSet.empty
            }

            return oldSet
          },
        },
        props: {
          decorations(state) {
            return spellcheckPluginKey.getState(state)
          },
          handleClick(view, pos) {
            if (storage.isDisabled) {
              return false
            }

            const request = resolveSpellcheckPopupRequest(storage.errors, pos, view.coordsAtPos.bind(view))
            if (!request) {
              return false
            }

            dispatchPopupRequest(view, request)
            return true
          },
        },
        view(editorView) {
          const clearSpellcheck = () => {
            storage.errors = []
            const tr = editorView.state.tr.setMeta(spellcheckPluginKey, {
              type: 'clearAll',
            } satisfies SpellcheckAction)
            editorView.dispatch(tr)
          }

          const handleSettingsChanged = (event: Event) => {
            const enabled = Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled)
            storage.isDisabled = !enabled
            if (!enabled) {
              clearSpellcheck()
            }
          }

          if (typeof window !== 'undefined') {
            window.addEventListener(SPELLCHECK_SETTINGS_CHANGED_EVENT, handleSettingsChanged)
          }

          if (!isSpellcheckFeatureEnabled()) {
            storage.isDisabled = true
            clearSpellcheck()
          }

          return {
            update(view, prevState) {
              const docChanged = !view.state.doc.eq(prevState.doc)
              if (!docChanged) {
                return
              }

              storage.requestId += 1
              if (debounceTimer) {
                clearTimeout(debounceTimer)
              }

              if (storage.isDisabled || !isSpellcheckFeatureEnabled()) {
                storage.isDisabled = true
                clearSpellcheck()
                return
              }

              const currentBlock = getSpellcheckTextblockFromSelection(view.state.selection.$from)
              if (!currentBlock) {
                return
              }

              debounceTimer = setTimeout(() => {
                if (!storage.isDisabled && isSpellcheckFeatureEnabled()) {
                  void storage.runCheck(view, currentBlock.text, currentBlock.rangeFrom)
                }
              }, options.debounceMs)
            },
            destroy() {
              if (debounceTimer) {
                clearTimeout(debounceTimer)
              }
              if (typeof window !== 'undefined') {
                window.removeEventListener(SPELLCHECK_SETTINGS_CHANGED_EVENT, handleSettingsChanged)
              }
            },
          }
        },
      }),
    ]
  },
})
