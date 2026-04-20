import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorView } from '@tiptap/pm/view';
import { Node } from '@tiptap/pm/model';
import { api } from '../../../lib/api';
import { findSpellcheckErrorAtPos } from './spellcheckHelpers';

export const spellcheckPluginKey = new PluginKey('ai-spellcheck-plugin');

let isGlobalSpellcheckDisabled = false;

export interface AISpellcheckOptions {
  debounceMs: number;
}

export interface SpellcheckError {
  word: string;
  suggestion: string;
  reason: string;
  from: number;
  to: number;
}

export interface SpellcheckTextblockTarget {
  text: string;
  rangeFrom: number;
  rangeTo: number;
  typeName: string;
}

function buildDecorationsFromErrors(errors: SpellcheckError[]) {
  return errors.map((error) => (
    Decoration.inline(error.from, error.to, {
      class: 'ai-spellcheck-error',
      'data-spellcheck-from': String(error.from),
      'data-spellcheck-to': String(error.to),
      'data-spellcheck-word': error.word,
      'data-spellcheck-suggestion': error.suggestion,
      'data-spellcheck-reason': error.reason,
      style: 'text-decoration: underline wavy red; cursor: pointer; background: rgba(255,0,0,0.05);',
    })
  ));
}

export function findSpellcheckMarkerFromTarget(target: EventTarget | null) {
  const isElementTarget = typeof Element !== 'undefined' && target instanceof Element;
  const isNodeTarget = typeof globalThis.Node !== 'undefined' && target instanceof globalThis.Node;
  const targetLike = target as {
    closest?: (selector: string) => HTMLElement | null;
    parentElement?: HTMLElement | null;
  } | null;
  const element = isElementTarget
    ? target
    : isNodeTarget
      ? target.parentElement
      : typeof targetLike?.closest === 'function'
        ? targetLike
        : targetLike?.parentElement ?? null;

  if (!element || typeof element.closest !== 'function') {
    return null;
  }

  return element.closest('.ai-spellcheck-error') as HTMLElement | null;
}

export function parseSpellcheckErrorFromTarget(target: EventTarget | null) {
  const marker = findSpellcheckMarkerFromTarget(target);
  if (!marker) {
    return null;
  }

  const from = Number(marker.dataset.spellcheckFrom);
  const to = Number(marker.dataset.spellcheckTo);
  const word = marker.dataset.spellcheckWord;
  const suggestion = marker.dataset.spellcheckSuggestion;
  const reason = marker.dataset.spellcheckReason ?? '';

  if (!Number.isFinite(from) || !Number.isFinite(to) || !word || !suggestion) {
    return null;
  }

  return {
    word,
    suggestion,
    reason,
    from,
    to,
  } as SpellcheckError;
}

export function findSpellcheckErrorFromTarget(
  errors: SpellcheckError[],
  target: EventTarget | null,
) {
  const marker = findSpellcheckMarkerFromTarget(target);
  if (!marker) {
    return null;
  }

  const from = Number(marker.dataset.spellcheckFrom);
  const to = Number(marker.dataset.spellcheckTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return null;
  }

  return errors.find((error) => error.from === from && error.to === to) ?? null;
}

export function findSpellcheckErrorFromCoords(
  errors: SpellcheckError[],
  posAtCoords: ((coords: { left: number; top: number }) => { pos: number } | null) | null | undefined,
  coords: { left: number; top: number },
) {
  if (!posAtCoords) {
    return null;
  }

  const resolved = posAtCoords(coords);
  return findSpellcheckErrorAtPos(errors, resolved?.pos);
}

export function findSpellcheckErrorFromRenderedRects(
  errors: SpellcheckError[],
  coordsAtPos: ((pos: number) => { left: number; right: number; top: number; bottom: number }) | null | undefined,
  point: { left: number; top: number },
  tolerance = 2,
) {
  if (!coordsAtPos) {
    return null;
  }

  for (const error of errors) {
    try {
      const startRect = coordsAtPos(error.from);
      const endRect = coordsAtPos(error.to);
      const left = Math.min(startRect.left, endRect.left) - tolerance;
      const right = Math.max(startRect.right, endRect.right) + tolerance;
      const top = Math.min(startRect.top, endRect.top) - tolerance;
      const bottom = Math.max(startRect.bottom, endRect.bottom) + tolerance;

      if (point.left >= left && point.left <= right && point.top >= top && point.top <= bottom) {
        return error;
      }
    } catch (_error) {
      continue;
    }
  }

  return null;
}

export function findSpellcheckErrorFromCaretPoint(
  errors: SpellcheckError[],
  resolvePosAtPoint: ((point: { left: number; top: number }) => number | null) | null | undefined,
  point: { left: number; top: number },
) {
  if (!resolvePosAtPoint) {
    return null;
  }

  const pos = resolvePosAtPoint(point);
  return findSpellcheckErrorAtPos(errors, pos);
}

export function findSpellcheckErrorFromPointProbes(
  resolveErrorAtPoint: ((point: { left: number; top: number }) => SpellcheckError | null) | null | undefined,
  point: { left: number; top: number },
  probes: Array<{ dx: number; dy: number }> = [
    { dx: 0, dy: 0 },
    { dx: 0, dy: -4 },
    { dx: 0, dy: -8 },
    { dx: -3, dy: 0 },
    { dx: 3, dy: 0 },
    { dx: 0, dy: 4 },
    { dx: -3, dy: -4 },
    { dx: 3, dy: -4 },
  ],
) {
  if (!resolveErrorAtPoint) {
    return null;
  }

  for (const probe of probes) {
    const match = resolveErrorAtPoint({
      left: point.left + probe.dx,
      top: point.top + probe.dy,
    });
    if (match) {
      return match;
    }
  }

  return null;
}

export function findSpellcheckErrorsInRange(
  errors: SpellcheckError[],
  rangeFrom: number,
  rangeTo: number,
) {
  return errors.filter((error) => error.from >= rangeFrom && error.to <= rangeTo);
}

export function findClosestSpellcheckErrorByPoint(
  errors: SpellcheckError[],
  coordsAtPos: ((pos: number) => { left: number; right: number; top: number; bottom: number }) | null | undefined,
  point: { left: number; top: number },
  maxDistance = 18,
) {
  if (!coordsAtPos || errors.length === 0) {
    return null;
  }

  let closestError: SpellcheckError | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const error of errors) {
    try {
      const startRect = coordsAtPos(error.from);
      const endRect = coordsAtPos(error.to);
      const left = Math.min(startRect.left, endRect.left);
      const right = Math.max(startRect.right, endRect.right);
      const top = Math.min(startRect.top, endRect.top);
      const bottom = Math.max(startRect.bottom, endRect.bottom);

      const dx = point.left < left ? left - point.left : point.left > right ? point.left - right : 0;
      const dy = point.top < top ? top - point.top : point.top > bottom ? point.top - bottom : 0;
      const distance = Math.hypot(dx, dy);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestError = error;
      }
    } catch (_error) {
      continue;
    }
  }

  return closestDistance <= maxDistance ? closestError : null;
}

export function findSpellcheckErrorsMatchingBlockText(
  errors: SpellcheckError[],
  blockText: string | null | undefined,
) {
  const normalized = blockText?.trim();
  if (!normalized) {
    return [];
  }

  return errors.filter((error) => normalized.includes(error.word));
}

export function collectSpellcheckTextblocks(doc: Node) {
  const blocks: SpellcheckTextblockTarget[] = [];

  doc.descendants((node: Node, pos: number) => {
    const text = node.textContent?.trim();
    if (node.isTextblock && text) {
      blocks.push({
        text: node.textContent,
        rangeFrom: pos + 1,
        rangeTo: pos + node.nodeSize - 1,
        typeName: node.type.name,
      });
    }
    return true;
  });

  return blocks;
}

export function getSpellcheckTextblockAtPos(doc: Node, pos: number) {
  let matched: SpellcheckTextblockTarget | null = null;

  doc.descendants((node: Node, nodePos: number) => {
    const text = node.textContent?.trim();
    if (!node.isTextblock || !text) {
      return true;
    }

    const rangeFrom = nodePos + 1;
    const rangeTo = nodePos + node.nodeSize - 1;
    if (pos >= rangeFrom && pos <= rangeTo) {
      matched = {
        text: node.textContent,
        rangeFrom,
        rangeTo,
        typeName: node.type.name,
      };
      return false;
    }

    return true;
  });

  return matched;
}

export function mergeSpellcheckErrorsForRange(
  existingErrors: SpellcheckError[],
  nextErrors: SpellcheckError[],
  rangeFrom: number,
  rangeTo: number,
) {
  const preserved = existingErrors.filter((error) => error.to <= rangeFrom || error.from >= rangeTo);
  return [...preserved, ...nextErrors].sort((a, b) => a.from - b.from);
}

export function mapSpellcheckErrors(
  errors: SpellcheckError[],
  mapping: { map: (pos: number, assoc?: number) => number },
) {
  return errors
    .map((error) => {
      const from = mapping.map(error.from, 1);
      const to = mapping.map(error.to, -1);
      return {
        ...error,
        from,
        to,
      };
    })
    .filter((error) => error.to > error.from);
}

export function mapSpellcheckResultsToParagraph(
  view: EditorView | null,
  text: string,
  errors: Array<{ word: string; suggestion: string; reason: string; offset: number }>,
  explicitRangeFrom?: number | null,
) {
  const mappedErrors: SpellcheckError[] = [];
  const decorations: Decoration[] = [];
  let latestStartPos = typeof explicitRangeFrom === 'number' ? explicitRangeFrom - 1 : -1;

  if (latestStartPos === -1 && view) {
    view.state.doc.descendants((node: Node, pos: number) => {
      if (node.isBlock && node.textContent === text) {
        latestStartPos = pos;
        return false;
      }
      return true;
    });
  }

  if (latestStartPos === -1) {
    return { mappedErrors, decorations, rangeFrom: null, rangeTo: null };
  }

  const rangeFrom = latestStartPos + 1;
  const rangeTo = rangeFrom + text.length;

  errors.forEach((err) => {
    const from = rangeFrom + err.offset;
    const to = from + err.word.length;
    const wordAtPos = text.substring(err.offset, err.offset + err.word.length);

    if (wordAtPos === err.word) {
      mappedErrors.push({ ...err, from, to });
      decorations.push(...buildDecorationsFromErrors([{ ...err, from, to }]));
    }
  });

  return { mappedErrors, decorations, rangeFrom, rangeTo };
}

export const AISpellcheck = Extension.create<AISpellcheckOptions>({
  name: 'aiSpellcheck',

  addOptions() {
    return {
      debounceMs: 800,
    };
  },

  addStorage() {
    return {
      errors: [] as SpellcheckError[],
      isChecking: false,
      isDisabled: false,
      async runCheck(view: EditorView, text: string, explicitRangeFrom?: number | null) {
        if (isGlobalSpellcheckDisabled || this.isChecking || this.isDisabled) return;
        this.isChecking = true;
        try {
          const result = await api.spellcheck(text);
          const { mappedErrors, rangeFrom, rangeTo } = mapSpellcheckResultsToParagraph(
            view,
            text,
            result.errors || [],
            explicitRangeFrom,
          );

          if (rangeFrom !== null && rangeTo !== null) {
            this.errors = mergeSpellcheckErrorsForRange(this.errors, mappedErrors, rangeFrom, rangeTo);
          }
          
          const decorations = buildDecorationsFromErrors(this.errors);
          
          // Dispatch transaction to update decorations
          const dispatchTr = view.state.tr;
          dispatchTr.setMeta(spellcheckPluginKey, { 
            type: 'setDecorations', 
            decorations: DecorationSet.create(dispatchTr.doc, decorations) 
          });
          view.dispatch(dispatchTr);
          
        } catch (e: any) {
          console.error('Spellcheck failed:', e);
          // If 405 Method Not Allowed, disable spellcheck to prevent excessive retries
          if (e.message && e.message.includes('Method Not Allowed')) {
            console.warn('AISpellcheck: 405 received. Disabling spellcheck extension.');
            this.isDisabled = true;
            isGlobalSpellcheckDisabled = true;
          }
        } finally {
          this.isChecking = false;
        }
      }
    };
  },

  addProseMirrorPlugins() {
    const { options, storage } = this;
    let debounceTimer: any = null;

    return [
      new Plugin({
        key: spellcheckPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            // Handle custom action to set new decorations
            const action = tr.getMeta(spellcheckPluginKey);
            if (action && action.type === 'setDecorations') {
              return action.decorations;
            }
            
            if (action && action.type === 'removeError') {
              storage.errors = storage.errors.filter((error: SpellcheckError) => !(error.from === action.from && error.to === action.to));
              return DecorationSet.create(tr.doc, buildDecorationsFromErrors(storage.errors));
            }

            // Map decorations through transactions (e.g. typing)
            if (tr.docChanged && storage.errors.length > 0) {
              storage.errors = mapSpellcheckErrors(storage.errors, tr.mapping);
            }
            return oldSet.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return spellcheckPluginKey.getState(state);
          },
          handleDOMEvents: {
            compositionend: (view, _event) => {
              if (isGlobalSpellcheckDisabled || storage.isDisabled) return false;
              // Trigger spellcheck immediately when Chinese input method completion
              const { selection } = view.state;
              const node = selection.$from.parent;
              const rangeFrom = selection.$from.start();
              
              if (node.type.name === 'paragraph' && node.textContent.trim().length > 0) {
                // We use a small delay to let the DOM update before reading content
                setTimeout(() => {
                  if (isGlobalSpellcheckDisabled || storage.isDisabled) return;
                  this.storage.runCheck(view, node.textContent, rangeFrom);
                }, 100);
              }
              return false;
            },
            mouseover: (view, event) => {
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!pos) return false;
              
              const error = findSpellcheckErrorAtPos(storage.errors, pos.pos);
              
              if (error) {
                // Simplified: use browser title for tooltip
                (event.target as HTMLElement).title = `Suggestion: ${error.suggestion} (${error.reason})`;
              }
              return false;
            }
          }
        },
        view() {
          return {
            update: (view, prevState) => {
              if (isGlobalSpellcheckDisabled || storage.isDisabled) return;
              const docChanged = !view.state.doc.eq(prevState.doc);
              if (!docChanged) return;

              if (debounceTimer) clearTimeout(debounceTimer);
              
              debounceTimer = setTimeout(async () => {
                if (isGlobalSpellcheckDisabled || storage.isDisabled) return;
                const { state } = view;
                const node = state.selection.$from.parent;
                
                // Only check if it's a paragraph and has content
                if (node.type.name !== 'paragraph' || node.textContent.trim().length === 0) return;
                
                await storage.runCheck(view, node.textContent, state.selection.$from.start());
              }, options.debounceMs);
            },
            destroy: () => {
              if (debounceTimer) clearTimeout(debounceTimer);
            }
          };
        }
      }),
    ];
  },
});
