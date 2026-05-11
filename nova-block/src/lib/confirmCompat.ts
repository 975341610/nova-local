type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

function canUseNativeConfirm() {
  return typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.electron?.ipcInvoke
}

export async function confirmCompat(options: ConfirmOptions): Promise<boolean> {
  const {
    title,
    description,
    confirmLabel = '确定',
    cancelLabel = '取消',
    danger = false,
  } = options

  if (canUseNativeConfirm()) {
    try {
      return window.confirm(description ? `${title}\n\n${description}` : title)
    } catch {
      // Fall back to the custom confirm below in Electron-like environments.
    }
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    const dialog = document.createElement('div')
    const titleNode = document.createElement('h3')
    const descriptionNode = description ? document.createElement('p') : null
    const actions = document.createElement('div')
    const cancelButton = document.createElement('button')
    const confirmButton = document.createElement('button')
    let closed = false

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(false)
      }
    }

    const finish = (confirmed: boolean) => {
      if (closed) return
      closed = true
      window.removeEventListener('keydown', handleEscape)
      overlay.remove()
      resolve(confirmed)
    }

    overlay.dataset.testid = 'confirm-compat-overlay'
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.zIndex = '2147483647'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.background = 'rgba(15, 23, 42, 0.28)'
    overlay.style.backdropFilter = 'blur(10px)'

    dialog.style.width = 'min(92vw, 420px)'
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

    actions.style.display = 'flex'
    actions.style.justifyContent = 'flex-end'
    actions.style.gap = '10px'

    cancelButton.type = 'button'
    cancelButton.textContent = cancelLabel
    cancelButton.dataset.testid = 'confirm-compat-cancel'
    cancelButton.style.padding = '10px 14px'
    cancelButton.style.borderRadius = '12px'
    cancelButton.style.border = '1px solid rgba(148, 163, 184, 0.3)'
    cancelButton.style.background = 'rgba(255,255,255,0.9)'
    cancelButton.style.color = '#475569'
    cancelButton.style.fontWeight = '600'
    cancelButton.style.cursor = 'pointer'

    confirmButton.type = 'button'
    confirmButton.textContent = confirmLabel
    confirmButton.dataset.testid = 'confirm-compat-confirm'
    confirmButton.style.padding = '10px 16px'
    confirmButton.style.borderRadius = '12px'
    confirmButton.style.border = 'none'
    confirmButton.style.background = danger ? '#dc2626' : '#111827'
    confirmButton.style.color = '#fff'
    confirmButton.style.fontWeight = '700'
    confirmButton.style.cursor = 'pointer'

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        finish(false)
      }
    })
    dialog.addEventListener('click', (event) => event.stopPropagation())
    cancelButton.addEventListener('click', () => finish(false))
    confirmButton.addEventListener('click', () => finish(true))
    window.addEventListener('keydown', handleEscape)

    actions.append(cancelButton, confirmButton)
    dialog.append(titleNode)
    if (descriptionNode) {
      dialog.append(descriptionNode)
    }
    dialog.append(actions)
    overlay.append(dialog)
    document.body.append(overlay)

    window.setTimeout(() => {
      confirmButton.focus()
    }, 0)
  })
}
