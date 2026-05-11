import { Node, mergeAttributes, type Editor } from '@tiptap/core'

export const AIStreamingPreviewNode = Node.create({
  name: 'aiStreamingPreview',
  group: 'block',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      text: {
        default: '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-ai-streaming-preview]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const text = String(HTMLAttributes.text || '')
    const { text: _text, ...restAttributes } = HTMLAttributes
    const attrs = {
      ...restAttributes,
      'data-ai-streaming-preview': 'true',
      class: 'nova-ai-streaming-preview',
      style: 'white-space: pre-wrap; border-left: 3px solid hsl(var(--primary)); padding: 8px 12px; margin: 8px 0; border-radius: 8px; background: hsl(var(--muted) / 0.55); color: hsl(var(--foreground));',
    }
    return ['div', mergeAttributes(attrs), text || 'AI 正在生成...']
  },
})

export function insertAIStreamingPreview(editor: Editor): void {
  editor.chain().focus().insertContent({ type: 'aiStreamingPreview', attrs: { text: '' } }).run()
}

export function findAIStreamingPreview(editor: Editor): { pos: number; node: any } | null {
  let found: { pos: number; node: any } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'aiStreamingPreview') {
      found = { pos, node }
      return false
    }
    return true
  })
  return found
}

export function updateAIStreamingPreview(editor: Editor, text: string): void {
  const preview = findAIStreamingPreview(editor)
  if (!preview) return
  editor.chain().command(({ tr }) => {
    tr.setNodeMarkup(preview.pos, undefined, { ...preview.node.attrs, text })
    return true
  }).run()
}

export function replaceAIStreamingPreviewWithContent(editor: Editor, content: string): void {
  const preview = findAIStreamingPreview(editor)
  if (!preview) {
    editor.chain().focus().insertContent(content).run()
    return
  }
  editor
    .chain()
    .focus()
    .deleteRange({ from: preview.pos, to: preview.pos + preview.node.nodeSize })
    .insertContent(content)
    .run()
}

export function removeAIStreamingPreview(editor: Editor): void {
  const preview = findAIStreamingPreview(editor)
  if (!preview) return
  editor.chain().deleteRange({ from: preview.pos, to: preview.pos + preview.node.nodeSize }).run()
}
