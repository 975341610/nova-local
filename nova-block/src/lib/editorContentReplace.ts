import { createDocument, type Editor } from '@tiptap/core'

export function replaceEditorContentWithoutHistory(editor: Editor, content: string): boolean {
  const document = createDocument(content, editor.schema, {}, {
    errorOnInvalidContent: editor.options.enableContentCheck,
  })

  return editor
    .chain()
    .command(({ tr, dispatch }) => {
      if (dispatch) {
        tr
          .replaceWith(0, tr.doc.content.size, document.content)
          .setMeta('preventUpdate', true)
          .setMeta('addToHistory', false)
      }
      return true
    })
    .run()
}
