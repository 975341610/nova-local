import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorView } from '@tiptap/pm/view';
import { Node } from '@tiptap/pm/model';
import { api } from '../../../lib/api';
import { buildSpellcheckSuggestionDetail, findSpellcheckErrorAtPos } from './spellcheckHelpers';

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

function mapSpellcheckResultsToParagraph(
  view: EditorView,
  text: string,
  errors: Array<{ word: string; suggestion: string; reason: string; offset: number }>,
) {
  const mappedErrors: SpellcheckError[] = [];
  const decorations: Decoration[] = [];
  let latestStartPos = -1;

  view.state.doc.descendants((node: Node, pos: number) => {
    if (node.isBlock && node.textContent === text) {
      latestStartPos = pos;
      return false;
    }
    return true;
  });

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
      async runCheck(view: EditorView, text: string) {
        if (isGlobalSpellcheckDisabled || this.isChecking || this.isDisabled) return;
        this.isChecking = true;
        try {
          const result = await api.spellcheck(text);
          const { mappedErrors, rangeFrom, rangeTo } = mapSpellcheckResultsToParagraph(view, text, result.errors || []);

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

    const openSuggestionForError = (
      view: EditorView,
      error: SpellcheckError,
      targetRect?: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'> | null,
    ) => {
      const startCoords = targetRect ?? view.coordsAtPos(error.from);
      const endCoords = targetRect ?? view.coordsAtPos(error.to);
      const noteIdAttr = view.dom.closest('[data-note-id]')?.getAttribute('data-note-id');
      const parsedNoteId = noteIdAttr ? Number(noteIdAttr) : null;
      const detail = buildSpellcheckSuggestionDetail(error, startCoords, endCoords);

      window.dispatchEvent(new CustomEvent('open-spellcheck-suggestion', {
        detail: {
          ...detail,
          noteId: Number.isFinite(parsedNoteId) ? parsedNoteId : null,
        },
      }));

      return true;
    };

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
          handleClick: (view, pos, _event) => {
            const error = findSpellcheckErrorAtPos(storage.errors, pos);
            if (error) {
              return openSuggestionForError(view, error);
            }
            return false;
          },
          handleDOMEvents: {
            click: (view, event) => {
              if (isGlobalSpellcheckDisabled || storage.isDisabled) return false;
              if (!(event instanceof MouseEvent)) return false;

              const parsedError = parseSpellcheckErrorFromTarget(event.target);
              const marker = findSpellcheckMarkerFromTarget(event.target);
              if (parsedError && marker) {
                return openSuggestionForError(view, parsedError, marker.getBoundingClientRect());
              }

              const domMatchedError = findSpellcheckErrorFromTarget(storage.errors, event.target);
              if (domMatchedError) {
                return openSuggestionForError(view, domMatchedError);
              }

              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const error = findSpellcheckErrorAtPos(storage.errors, pos?.pos);
              if (error) {
                return openSuggestionForError(view, error);
              }
              return false;
            },
            compositionend: (view, _event) => {
              if (isGlobalSpellcheckDisabled || storage.isDisabled) return false;
              // Trigger spellcheck immediately when Chinese input method completion
              const { selection } = view.state;
              const node = selection.$from.parent;
              
              if (node.type.name === 'paragraph' && node.textContent.trim().length > 0) {
                // We use a small delay to let the DOM update before reading content
                setTimeout(() => {
                  if (isGlobalSpellcheckDisabled || storage.isDisabled) return;
                  this.storage.runCheck(view, node.textContent);
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
                
                await storage.runCheck(view, node.textContent);
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
