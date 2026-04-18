import { ReactRenderer } from '@tiptap/react';
import tippy, { sticky } from 'tippy.js';
import { SlashMenu, type SlashItem } from './SlashMenu';

export const getSuggestionConfig = (itemsRef: React.MutableRefObject<SlashItem[]>, isAiEnabled: boolean = true) => ({
  items: ({ query }: { query: string }) => {
    const items = itemsRef.current;
    const filtered = items.filter(item => {
      // AI 过滤逻辑
      if (item.requiresAI && !isAiEnabled) return false;

      const q = query.toLowerCase();
      return item.label.toLowerCase().includes(q) || item.keywords.some(k => k.toLowerCase().includes(q));
    });
    return filtered.slice(0, 50);
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

    const hasActiveSlashDecoration = () => {
      const decorations = Array.from(document.querySelectorAll('.suggestion'));

      return decorations.some(node => (node.textContent || '').trim().startsWith('/'));
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
          theme: 'slash-menu',
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
        component = new ReactRenderer(SlashMenu, {
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

          if (hasActiveSlashDecoration()) {
            return;
          }

          destroyPopup();
        });
      },
    };
  },
});
