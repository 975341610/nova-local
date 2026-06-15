import { mergeAttributes, Node } from '@tiptap/core'

import pixelMaidUrl from '../../../assets/pixel-maid.webp'

export const AILoadingNode = Node.create({
  name: 'aiLoadingPlaceholder',
  inline: true,
  group: 'inline',
  atom: true,
  parseHTML() {
    return [{ tag: 'img[data-ai-loading]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        src: pixelMaidUrl,
        'data-ai-loading': 'true',
        alt: 'AI Thinking...',
        width: 40,
        height: 40,
        style: 'display:inline-block; vertical-align:middle; margin:0 4px;',
      }),
    ]
  },
})
