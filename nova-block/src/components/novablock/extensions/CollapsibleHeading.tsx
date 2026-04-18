import { Heading as BaseHeading } from '@tiptap/extension-heading';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { HeadingView } from './HeadingView';

export const CollapsibleHeading = BaseHeading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        keepOnSplit: false,
        parseHTML: element => element.getAttribute('data-collapsed') === 'true',
        renderHTML: attributes => {
          if (!attributes.collapsed) return {};
          return { 'data-collapsed': 'true' };
        },
      },
      id: {
        default: null,
        parseHTML: element => element.getAttribute('id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { id: attributes.id };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HeadingView);
  },

  addCommands() {
    return {
      ensureHeadingIds: () => ({ tr, dispatch }: any) => {
        let changed = false;
        const usedIds = new Set<string>();

        tr.doc.descendants((node: any) => {
          if (node.type.name === 'heading' && node.attrs.id) {
            usedIds.add(node.attrs.id);
          }
        });

        tr.doc.descendants((node: any, pos: number) => {
          if (node.type.name === 'heading' && !node.attrs.id) {
            const text = node.textContent.trim();
            const safeSlug = text
              .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');
            
            let baseId = `h-${safeSlug || Math.random().toString(36).substring(2, 7)}`;
            let id = baseId;
            let counter = 1;
            
            while (usedIds.has(id)) {
              id = `${baseId}-${counter++}`;
            }
            
            usedIds.add(id);
            if (dispatch) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                id,
              });
            }
            changed = true;
          }
        });

        return changed;
      },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('collapsible-heading-logic'),
        props: {
          decorations: (state) => {
            const { doc } = state;
            const decorations: Decoration[] = [];
            let foldLevel: number | null = null;

            doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                const currentLevel = node.attrs.level;
                
                // 如果当前正在折叠状态，且遇到了同级或更高层级的标题，结束折叠
                if (foldLevel !== null && currentLevel <= foldLevel) {
                  foldLevel = null;
                }

                // 如果处于折叠范围内，添加隐藏 decoration
                if (foldLevel !== null) {
                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: 'hidden-by-fold',
                      style: 'display: none !important;',
                    })
                  );
                  return false; // 跳过标题内部节点
                }

                // 如果当前标题设置为折叠，开始折叠
                if (node.attrs.collapsed) {
                  foldLevel = currentLevel;
                }
                return false; // 跳过标题内部节点
              } else if (node.isBlock) {
                if (foldLevel !== null) {
                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: 'hidden-by-fold',
                      style: 'display: none !important;',
                    })
                  );
                  return false; // 跳过块内部节点
                }
              }
              return true;
            });

            return DecorationSet.create(doc, decorations);
          },

          handleKeyDown: (view, event) => {
            if (event.key !== 'Backspace' && event.key !== 'Delete') {
              return false;
            }

            const { state, dispatch } = view;
            const { selection } = state;

            // 检查是否是 NodeSelection 且选中了折叠的 heading
            if (selection instanceof NodeSelection && selection.node.type.name === 'heading' && selection.node.attrs.collapsed) {
              const startPos = selection.from;
              const foldLevel = selection.node.attrs.level;
              let endPos = selection.to;

              // 向后遍历找到属于该折叠范围的所有内容
              state.doc.nodesBetween(selection.to, state.doc.content.size, (node, pos) => {
                if (pos < endPos) return true;
                
                if (node.type.name === 'heading') {
                  if (node.attrs.level <= foldLevel) {
                    return false; // 遇到了同级或更高层级，停止
                  }
                }
                
                endPos = pos + node.nodeSize;
                return true;
              });

              if (dispatch) {
                const tr = state.tr.delete(startPos, endPos);
                dispatch(tr);
              }
              return true;
            }

            return false;
          },
        },
      }),
      // 保留原有的 ID 生成逻辑 (从 tiptapExtensions.ts 迁移过来)
      new Plugin({
        key: new PluginKey('heading-id-generator'),
        appendTransaction: (transactions, _oldState, newState) => {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return;

          const { tr } = newState;
          let changed = false;
          const usedIds = new Set<string>();

          newState.doc.descendants((node) => {
            if (node.type.name === 'heading' && node.attrs.id) {
              usedIds.add(node.attrs.id);
            }
          });

          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'heading' && !node.attrs.id) {
              const text = node.textContent.trim();
              const safeSlug = text
                .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
              
              let baseId = `h-${safeSlug || Math.random().toString(36).substring(2, 7)}`;
              let id = baseId;
              let counter = 1;
              
              while (usedIds.has(id)) {
                id = `${baseId}-${counter++}`;
              }
              
              usedIds.add(id);
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                id,
              });
              changed = true;
            }
          });

          return changed ? tr.setMeta('addToHistory', false) : undefined;
        },
      }),
    ];
  },
});
