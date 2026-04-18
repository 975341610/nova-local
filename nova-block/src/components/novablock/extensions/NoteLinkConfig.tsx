import { ReactRenderer } from '@tiptap/react';
import tippy, { sticky } from 'tippy.js';
import { NoteLinkSuggestion } from './NoteLinkSuggestion';

export const getNoteLinkSuggestionConfig = () => ({
  items: ({ query }: { query: string }) => {
    try {
      const notes = (window as any).novaNotes || [];
      return notes
        .filter((note: any) => 
          !note.is_folder &&
          (note.title || '').toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 10);
    } catch (error) {
      console.error('Failed to filter notes for suggestion:', error);
      return [];
    }
  },

  render: () => {
    let component: any;
    let popup: any;
    let cleanupFrame: number | null = null;

    const cancelScheduledCleanup = () => {
      if (cleanupFrame !== null) {
        cancelAnimationFrame(cleanupFrame);
        cleanupFrame = null;
      }
    };

    const destroyPopup = () => {
      const instance = popup?.[0];

      if (instance && !instance.state?.isDestroyed) {
        instance.destroy();
      }

      popup = null;

      if (component) {
        component.destroy();
        component = null;
      }
    };

    const hasActiveNoteLinkDecoration = () => {
      // 检查是否还有激活的 suggestion 装饰器
      const decorations = Array.from(document.querySelectorAll('.suggestion'));
      // NoteLink 的触发字符是 [[
      return decorations.some(node => (node.textContent || '').trim().startsWith('[['));
    };

    const ensurePopup = (props: any) => {
      cancelScheduledCleanup();

      if (!props.clientRect || !component?.element) {
        return false;
      }

      const instance = popup?.[0];

      if (!instance || instance.state?.isDestroyed) {
        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          theme: 'note-link-menu',
          arrow: false,
          sticky: true,
          zIndex: 99999,
          popperOptions: {
            modifiers: [
              {
                name: 'offset',
                options: {
                  offset: [0, 8],
                },
              },
            ],
          },
          plugins: [sticky],
        });

        return true;
      }

      instance.setProps({
        getReferenceClientRect: props.clientRect,
      });

      return true;
    };

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(NoteLinkSuggestion, {
          props,
          editor: props.editor,
        });
        ensurePopup(props);
      },

      onUpdate(props: any) {
        component.updateProps(props);
        ensurePopup(props);
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup?.[0]?.hide();
          return true;
        }

        return component.ref?.onKeyDown(props);
      },

      onExit() {
        cancelScheduledCleanup();
        cleanupFrame = requestAnimationFrame(() => {
          cleanupFrame = null;

          if (hasActiveNoteLinkDecoration()) {
            return;
          }

          destroyPopup();
        });
      },
    };
  },
});
