type PromptOptions = {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  submitLabel?: string
  cancelLabel?: string
  multiline?: boolean
}

function canUseNativePrompt() {
  return typeof window !== 'undefined' && typeof window.prompt === 'function' && !window.electron?.ipcInvoke
}

export async function promptCompat(options: PromptOptions): Promise<string | null> {
  const {
    title,
    description,
    defaultValue = '',
    placeholder = '',
    submitLabel = '确定',
    cancelLabel = '取消',
    multiline = false,
  } = options

  if (canUseNativePrompt()) {
    try {
      const nativeValue = window.prompt(title, defaultValue)
      return nativeValue == null ? null : nativeValue
    } catch {
      // Fall back to the custom prompt below in Electron-like environments.
    }
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    const dialog = document.createElement('div')
    const titleNode = document.createElement('h3')
    const input = multiline ? document.createElement('textarea') : document.createElement('input')
    const descriptionNode = description ? document.createElement('p') : null
    const actions = document.createElement('div')
    const cancelButton = document.createElement('button')
    const submitButton = document.createElement('button')
    let closed = false

    const finish = (value: string | null) => {
      if (closed) return
      closed = true
      overlay.remove()
      resolve(value)
    }

    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.zIndex = '2147483647'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.background = 'rgba(15, 23, 42, 0.28)'
    overlay.style.backdropFilter = 'blur(10px)'

    dialog.style.width = 'min(92vw, 520px)'
    dialog.style.display = 'flex'
    dialog.style.flexDirection = 'column'
    dialog.style.gap = '12px'
    dialog.style.padding = '20px'
    dialog.style.borderRadius = '20px'
    dialog.style.background = 'rgba(255, 252, 248, 0.98)'
    dialog.style.border = '1px solid rgba(148, 163, 184, 0.28)'
    dialog.style.boxShadow = '0 24px 80px rgba(15, 23, 42, 0.18)'
    dialog.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif'

    titleNode.textContent = title
    titleNode.style.margin = '0'
    titleNode.style.fontSize = '18px'
    titleNode.style.fontWeight = '700'
    titleNode.style.color = '#1f2937'

    if (descriptionNode) {
      descriptionNode.textContent = description ?? ''
      descriptionNode.style.margin = '0'
      descriptionNode.style.fontSize = '13px'
      descriptionNode.style.lineHeight = '1.6'
      descriptionNode.style.color = '#6b7280'
    }

    input.value = defaultValue
    input.placeholder = placeholder
    input.style.width = '100%'
    input.style.boxSizing = 'border-box'
    input.style.padding = multiline ? '12px 14px' : '11px 14px'
    input.style.borderRadius = '14px'
    input.style.border = '1px solid rgba(148, 163, 184, 0.35)'
    input.style.background = '#fff'
    input.style.color = '#111827'
    input.style.fontSize = '14px'
    input.style.outline = 'none'

    if (multiline && input instanceof HTMLTextAreaElement) {
      input.rows = 5
      input.style.resize = 'vertical'
      input.style.minHeight = '120px'
    }

    actions.style.display = 'flex'
    actions.style.justifyContent = 'flex-end'
    actions.style.gap = '10px'

    cancelButton.type = 'button'
    cancelButton.textContent = cancelLabel
    cancelButton.style.padding = '10px 14px'
    cancelButton.style.borderRadius = '12px'
    cancelButton.style.border = '1px solid rgba(148, 163, 184, 0.3)'
    cancelButton.style.background = 'rgba(255,255,255,0.9)'
    cancelButton.style.color = '#475569'
    cancelButton.style.fontWeight = '600'
    cancelButton.style.cursor = 'pointer'

    submitButton.type = 'button'
    submitButton.textContent = submitLabel
    submitButton.style.padding = '10px 16px'
    submitButton.style.borderRadius = '12px'
    submitButton.style.border = 'none'
    submitButton.style.background = '#111827'
    submitButton.style.color = '#fff'
    submitButton.style.fontWeight = '700'
    submitButton.style.cursor = 'pointer'

    const submit = () => finish(input.value)

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        finish(null)
      }
    })
    dialog.addEventListener('click', (event) => event.stopPropagation())
    cancelButton.addEventListener('click', () => finish(null))
    submitButton.addEventListener('click', submit)
    input.addEventListener('keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.preventDefault()
        finish(null)
      }
      if (keyboardEvent.key === 'Enter' && !multiline) {
        keyboardEvent.preventDefault()
        submit()
      }
      if (keyboardEvent.key === 'Enter' && (keyboardEvent.ctrlKey || keyboardEvent.metaKey) && multiline) {
        keyboardEvent.preventDefault()
        submit()
      }
    })

    actions.append(cancelButton, submitButton)
    dialog.append(titleNode)
    if (descriptionNode) {
      dialog.append(descriptionNode)
    }
    dialog.append(input, actions)
    overlay.append(dialog)
    document.body.append(overlay)

    window.setTimeout(() => {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }, 0)
  })
}
