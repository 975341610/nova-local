import { getApiBase } from './apiUrl'

const CHUNK_SIZE = 1024 * 256

const supportsWebCrypto = () => typeof crypto !== 'undefined' && !!crypto.subtle

const toHex = (buffer: ArrayBuffer) => (
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
)

const digestSha256 = async (blob: Blob) => {
  if (!supportsWebCrypto()) {
    return null
  }
  const bytes = await blob.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(hash)
}

export const uploadFiles = async (files: File[], noteId?: number | string) => {
  const API_BASE = getApiBase()

  const results = await Promise.all(files.map(async (file) => {
    if (file.size <= CHUNK_SIZE) {
      const formData = new FormData()
      formData.append('file', file)
      if (noteId) formData.append('note_id', noteId.toString())
      const response = await fetch(`${API_BASE}/media/upload`, { method: 'POST', body: formData })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    }

    const fileSha256 = await digestSha256(file)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    const initForm = new FormData()
    initForm.append('filename', file.name)
    initForm.append('size', file.size.toString())
    initForm.append('total_chunks', totalChunks.toString())
    if (fileSha256) initForm.append('file_sha256', fileSha256)
    if (noteId) initForm.append('note_id', noteId.toString())

    const initRes = await fetch(`${API_BASE}/media/upload/init`, { method: 'POST', body: initForm })
    if (!initRes.ok) throw new Error('Failed to init upload')
    const { upload_id } = await initRes.json()

    let uploadedChunks = new Set<number>()
    try {
      const statusRes = await fetch(`${API_BASE}/media/upload/status/${encodeURIComponent(upload_id)}`)
      if (statusRes.ok) {
        const status = await statusRes.json()
        uploadedChunks = new Set(Array.isArray(status.uploaded_chunks) ? status.uploaded_chunks : [])
      }
    } catch {
      // ignore status errors and continue uploading all chunks
    }

    for (let i = 0; i < totalChunks; i++) {
      if (uploadedChunks.has(i)) {
        continue
      }
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      const chunkSha256 = await digestSha256(chunk)
      const chunkForm = new FormData()
      chunkForm.append('upload_id', upload_id)
      chunkForm.append('chunk_index', i.toString())
      chunkForm.append('file', chunk)
      if (chunkSha256) chunkForm.append('chunk_sha256', chunkSha256)
      if (noteId) chunkForm.append('note_id', noteId.toString())

      const chunkRes = await fetch(`${API_BASE}/media/upload/chunk`, { method: 'POST', body: chunkForm })
      if (!chunkRes.ok) throw new Error(`Failed to upload chunk ${i}`)
    }

    const compForm = new FormData()
    compForm.append('upload_id', upload_id)
    compForm.append('filename', file.name)
    compForm.append('content_type', file.type)
    compForm.append('total_chunks', totalChunks.toString())
    if (fileSha256) compForm.append('file_sha256', fileSha256)
    if (noteId) compForm.append('note_id', noteId.toString())

    const compRes = await fetch(`${API_BASE}/media/upload/complete`, { method: 'POST', body: compForm })
    if (!compRes.ok) throw new Error('Failed to complete upload')
    return compRes.json()
  }))

  return results
}

export const uploadMusicFile = async (file: File, cover?: File) => {
  const API_BASE = getApiBase()
  const formData = new FormData()
  formData.append('file', file)
  if (cover) formData.append('cover', cover)
  const response = await fetch(`${API_BASE}/media/music-upload`, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
