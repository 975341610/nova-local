/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarTree } from '../components/sidebar/SidebarTree'
import { api } from '../lib/api'
import { useNoteStore } from '../store/useNoteStore'

vi.mock('../components/sidebar/TreeNodeItem', () => ({
  TreeNodeItem: () => null,
}))

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({
  default: () => null,
}))

vi.mock('../components/sidebar/BacklinksPanel', () => ({
  default: () => null,
}))

const openAiPanel = () => {
  fireEvent.click(screen.getByRole('button', { name: 'open-ai-panel' }))
}

const aiGeneratedNote = {
  id: 202,
  title: 'AI Import - Multi file',
  icon: 'AI',
  summary: '',
  content: '<h2>Summary</h2><p><strong>Content</strong></p><ul><li><p>A</p></li></ul>',
  is_title_manually_edited: true,
  tags: ['AI Import'],
  properties: [],
  links: [],
  notebook_id: null,
  parent_id: null,
  position: 0,
  sort_key: 'm',
  is_folder: false,
  created_at: '2026-05-09T00:00:00',
}

describe('SidebarTree AI import generate entry', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
    useNoteStore.getState().setNotes([])
    useNoteStore.getState().setCurrentNoteId(null)
  })

  it('shows AI workbench modes for import, ask, and writing', async () => {
    render(<SidebarTree selectedNodeId={null} onNodeSelect={vi.fn()} />)
    openAiPanel()

    expect(screen.getByRole('button', { name: 'ai-workbench-mode-import' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ai-workbench-mode-ask' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ai-workbench-mode-write' })).toBeTruthy()
    expect(screen.getByTestId('ai-import-empty')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'ai-workbench-mode-ask' }))
    expect(await screen.findByRole('combobox', { name: 'ai-ask-scope-select' })).toBeTruthy()
    expect(screen.getByLabelText('ask-import-batch-input')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'ai-workbench-mode-write' }))
    expect(await screen.findByTestId('ai-write-panel')).toBeTruthy()
    expect(screen.getByText('总结当前笔记')).toBeTruthy()
  })

  it('previews files, lets the user choose a template, generates one AI note, and selects it', async () => {
    const onNodeSelect = vi.fn()
    vi.spyOn(api, 'previewImportFiles').mockResolvedValue({
      items: [
        {
          file_name: 'a.md',
          file_type: 'md',
          size: 12,
          title: 'a',
          status: 'ok',
          message: '',
          summary: 'First file',
          block_count: 2,
        },
        {
          file_name: 'b.txt',
          file_type: 'txt',
          size: 8,
          title: 'b',
          status: 'ok',
          message: '',
          summary: 'Second file',
          block_count: 1,
        },
      ],
    })
    vi.spyOn(api, 'importAndGenerateNote').mockResolvedValue({
      title: aiGeneratedNote.title,
      markdown: '## Summary\n**Content**\n- A',
      source_type: 'file',
      metadata: {
        file_count: 2,
        template_id: 'meeting',
        import_batch_id: 'imp_test_files',
        source_refs: [
          { kind: 'file', name: 'a.md', title: 'a' },
          { kind: 'file', name: 'b.txt', title: 'b' },
        ],
      },
    })
    vi.spyOn(api, 'createNote').mockResolvedValue(aiGeneratedNote)
    vi.spyOn(api, 'upload').mockResolvedValue([
      { url: '/api/media/static/files/202/a.md', name: 'a.md', size: 12, type: 'text/markdown' },
      { url: '/api/media/static/files/202/b.txt', name: 'b.txt', size: 8, type: 'text/plain' },
    ])
    vi.spyOn(api, 'updateNote').mockResolvedValue({
      ...aiGeneratedNote,
      content: `${aiGeneratedNote.content}<h2>附件</h2><a href="/api/media/static/files/202/a.md">a.md</a>`,
    })

    render(<SidebarTree selectedNodeId={null} onNodeSelect={onNodeSelect} />)
    expect(screen.queryByTestId('ai-import-generate-input')).toBeNull()
    openAiPanel()

    const input = screen.getByTestId('ai-import-generate-input') as HTMLInputElement
    const files = [
      new File(['# First'], 'a.md', { type: 'text/markdown' }),
      new File(['Second'], 'b.txt', { type: 'text/plain' }),
    ]
    fireEvent.change(input, { target: { files } })

    await waitFor(() => {
      expect(api.previewImportFiles).toHaveBeenCalledWith(files)
    })
    expect(api.importAndGenerateNote).not.toHaveBeenCalled()
    expect(await screen.findByText('a.md')).toBeTruthy()
    expect(screen.getByText('b.txt')).toBeTruthy()
    expect(screen.getByRole('option', { name: '通用整理' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '视频笔记' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '会议纪要' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '学习笔记' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('import-template-select'), { target: { value: 'meeting' } })
    fireEvent.click(screen.getByRole('button', { name: 'generate-ai-import-note' }))

    await waitFor(() => {
      expect(api.importAndGenerateNote).toHaveBeenCalledWith(files, { templateId: 'meeting' })
    })
    await waitFor(() => {
      expect(api.createNote).toHaveBeenCalledWith(expect.objectContaining({
        title: aiGeneratedNote.title,
        icon: 'AI',
        type: 'note',
        tags: ['AI Import'],
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'import_batch_id', type: 'text', value: 'imp_test_files' }),
          expect.objectContaining({ name: 'import_source_type', type: 'text', value: 'file' }),
        ]),
      }))
    })
    const createPayload = vi.mocked(api.createNote).mock.calls[0][0]
    expect(createPayload.content).toContain('<h2>Summary</h2>')
    expect(createPayload.content).toContain('<strong>Content</strong>')
    expect(createPayload.content).not.toContain('## Summary')
    await waitFor(() => {
      expect(api.upload).toHaveBeenCalledWith(files, 202)
    })
    expect(api.updateNote).toHaveBeenCalledWith(202, expect.objectContaining({
      content: expect.stringContaining('<h2>附件</h2>'),
    }))
    await waitFor(() => {
      expect(useNoteStore.getState().notes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 202, title: aiGeneratedNote.title })]))
    })
    expect(onNodeSelect).toHaveBeenCalledWith('202')
  })

  it('asks the whole knowledge base from the AI workbench ask mode', async () => {
    vi.spyOn(api, 'createNote').mockResolvedValue({ ...aiGeneratedNote, id: 203, title: 'AI 回答 - 全库回答' })
    vi.spyOn(api, 'streamChat').mockImplementation(async (_payload, onChunk) => {
      onChunk('全库')
      onChunk('回答')
      onChunk('\n__CITATIONS__:[{"note_id":202,"title":"**Related Note**","chunk_id":"chunk-202","score":0.9,"excerpt":"- Related excerpt."}]')
    })

    render(<SidebarTree selectedNodeId={null} onNodeSelect={vi.fn()} />)
    openAiPanel()

    fireEvent.click(screen.getByRole('button', { name: 'ai-workbench-mode-ask' }))
    fireEvent.change(await screen.findByLabelText('ask-import-batch-input'), { target: { value: '全库有什么？' } })
    fireEvent.click(screen.getByRole('button', { name: 'ask-import-batch' }))

    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledWith({ question: '全库有什么？', mode: 'rag' }, expect.any(Function))
    })
    expect(await screen.findByText('全库回答')).toBeTruthy()
    expect(screen.getByText('Related Note')).toBeTruthy()
    expect(screen.getByText('Related excerpt.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /save-ai-answer-/ }))
    await waitFor(() => {
      expect(api.createNote).toHaveBeenCalledWith(expect.objectContaining({
        title: 'AI 回答 - 全库有什么？',
        content: expect.stringContaining('<h2>问答信息</h2>'),
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'ai_source', value: 'side_panel_answer' }),
          expect.objectContaining({ name: 'ai_scope', value: 'vault' }),
          expect.objectContaining({ name: 'ai_question', value: '全库有什么？' }),
          expect.objectContaining({ name: 'ai_citations', value: expect.stringContaining('Related Note') }),
        ]),
      }))
    })
    const createPayload = vi.mocked(api.createNote).mock.calls.at(-1)?.[0]
    expect(createPayload?.content).toContain('<strong>问题：</strong>全库有什么？')
    expect(createPayload?.content).toContain('<strong>范围：</strong>全部知识库')
    expect(createPayload?.content).toContain('<h2>AI 回答</h2>')
    expect(createPayload?.content).toContain('<h2>引用来源</h2>')
    expect(createPayload?.content).toContain('data-type="note-link"')
    expect(createPayload?.content).toContain('data-id="202"')
    expect(createPayload?.content).toContain('Related Note')
  })

  it('opens the note matching the citation title when a cached citation id is stale', async () => {
    const onNodeSelect = vi.fn()
    useNoteStore.getState().setNotes([
      { ...aiGeneratedNote, id: 401, title: 'Wrong Note', content: '<p>B</p>' },
      { ...aiGeneratedNote, id: 402, title: 'Actual Source', content: '<p>A</p>' },
    ])
    vi.spyOn(api, 'streamChat').mockImplementation(async (_payload, onChunk) => {
      onChunk('Answer')
      onChunk('\n__CITATIONS__:[{"note_id":401,"title":"Actual Source","chunk_id":"chunk-stale","score":0.9,"excerpt":"Source excerpt."}]')
    })

    render(<SidebarTree selectedNodeId={null} onNodeSelect={onNodeSelect} />)
    openAiPanel()

    fireEvent.click(screen.getByRole('button', { name: 'ai-workbench-mode-ask' }))
    fireEvent.change(await screen.findByLabelText('ask-import-batch-input'), { target: { value: 'Where is it from?' } })
    fireEvent.click(screen.getByRole('button', { name: 'ask-import-batch' }))

    expect(await screen.findByText('Actual Source')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'open-import-citation-402' }))
    expect(onNodeSelect).toHaveBeenLastCalledWith('402')
  })

  it('previews a url, generates one AI note, and selects it', async () => {
    const onNodeSelect = vi.fn()
    vi.spyOn(api, 'previewImportUrls').mockResolvedValue({
      items: [
        {
          file_name: 'https://example.com/post',
          file_type: 'url',
          size: 128,
          title: 'Example post',
          status: 'ok',
          message: '',
          summary: 'A useful article.',
          block_count: 2,
        },
      ],
    })
    vi.spyOn(api, 'importUrlsAndGenerateNote').mockResolvedValue({
      title: 'AI Import - Example post',
      markdown: '## Summary\nA useful article.',
      source_type: 'url',
      metadata: {
        url_count: 1,
        template_id: 'study',
        import_batch_id: 'imp_test_url',
        source_refs: [{ kind: 'url', url: 'https://example.com/post', title: 'Example post' }],
      },
    })
    vi.spyOn(api, 'createNote').mockResolvedValue({ ...aiGeneratedNote, title: 'AI Import - Example post' })
    vi.spyOn(api, 'upload').mockResolvedValue([])
    vi.spyOn(api, 'askImportBatch').mockResolvedValue({
      answer: 'This import explains the example post.',
      citations: [{ note_id: 202, title: 'AI Import - Example post', chunk_id: 'import-batch-202', score: 1, excerpt: 'A useful article.' }],
      mode: 'import_batch',
    })

    render(<SidebarTree selectedNodeId={null} onNodeSelect={onNodeSelect} />)
    openAiPanel()

    fireEvent.change(screen.getByLabelText('ai-import-url-input'), { target: { value: 'https://example.com/post' } })
    fireEvent.click(screen.getByRole('button', { name: 'preview-ai-import-url' }))

    await waitFor(() => {
      expect(api.previewImportUrls).toHaveBeenCalledWith(['https://example.com/post'])
    })
    expect((await screen.findAllByText('https://example.com/post')).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('import-template-select'), { target: { value: 'study' } })
    fireEvent.click(screen.getByRole('button', { name: 'generate-ai-import-note' }))

    await waitFor(() => {
      expect(api.importUrlsAndGenerateNote).toHaveBeenCalledWith(['https://example.com/post'], { templateId: 'study' })
    })
    await waitFor(() => {
      expect(api.createNote).toHaveBeenCalledWith(expect.objectContaining({
        title: 'AI Import - Example post',
        icon: 'AI',
        type: 'note',
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'import_batch_id', type: 'text', value: 'imp_test_url' }),
          expect.objectContaining({ name: 'import_source_type', type: 'text', value: 'url' }),
        ]),
      }))
    })
    expect(onNodeSelect).toHaveBeenCalledWith('202')
    expect(await screen.findByText('引用来源')).toBeTruthy()
    expect(screen.getByText('Example post')).toBeTruthy()
    expect(screen.getByText('https://example.com/post')).toBeTruthy()

    fireEvent.change(await screen.findByLabelText('ask-import-batch-input'), { target: { value: '讲了什么？' } })
    fireEvent.click(screen.getByRole('button', { name: 'ask-import-batch' }))

    await waitFor(() => {
      expect(api.askImportBatch).toHaveBeenCalledWith('imp_test_url', '讲了什么？')
    })
    expect(await screen.findByText('讲了什么？')).toBeTruthy()
    expect(await screen.findByText('This import explains the example post.')).toBeTruthy()
    expect(screen.getByText('AI Import - Example post')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'open-import-citation-202' }))
    expect(onNodeSelect).toHaveBeenLastCalledWith('202')
    fireEvent.click(screen.getByRole('button', { name: 'clear-import-chat-history' }))
    expect(screen.queryByText('This import explains the example post.')).toBeNull()
  })

  it('previews and generates multiple pasted urls as one import batch', async () => {
    const urls = ['https://example.com/a', 'https://www.bilibili.com/video/BV1xx411c7mD?p=1']
    vi.spyOn(api, 'previewImportUrls').mockResolvedValue({
      items: [
        {
          file_name: urls[0],
          file_type: 'url',
          size: 128,
          title: 'Article A',
          status: 'ok',
          message: '',
          summary: 'First source.',
          block_count: 2,
        },
        {
          file_name: urls[1],
          file_type: 'video',
          size: 64,
          title: 'B站 demo video',
          status: 'ok',
          message: '',
          summary: 'Video metadata.',
          block_count: 1,
        },
      ],
    })
    vi.spyOn(api, 'importUrlsAndGenerateNote').mockResolvedValue({
      title: 'AI Import - Multi URL',
      markdown: '## Summary\nCombined sources.',
      source_type: 'url',
      metadata: {
        url_count: 2,
        template_id: 'general',
        import_batch_id: 'imp_multi_url',
        source_refs: [
          { kind: 'url', url: urls[0], title: 'Article A' },
          { kind: 'video', url: urls[1], title: 'B站 demo video' },
        ],
      },
    })
    vi.spyOn(api, 'createNote').mockResolvedValue({ ...aiGeneratedNote, title: 'AI Import - Multi URL' })
    vi.spyOn(api, 'upload').mockResolvedValue([])

    render(<SidebarTree selectedNodeId={null} onNodeSelect={vi.fn()} />)
    openAiPanel()

    fireEvent.change(screen.getByLabelText('ai-import-url-input'), {
      target: { value: `${urls[0]}\n${urls[1]}` },
    })
    fireEvent.click(screen.getByRole('button', { name: 'preview-ai-import-url' }))

    await waitFor(() => {
      expect(api.previewImportUrls).toHaveBeenCalledWith(urls)
    })
    expect((await screen.findAllByText(urls[0])).length).toBeGreaterThan(0)
    expect(screen.getAllByText(urls[1]).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'generate-ai-import-note' }))

    await waitFor(() => {
      expect(api.importUrlsAndGenerateNote).toHaveBeenCalledWith(urls, { templateId: 'general' })
    })
    const createPayload = vi.mocked(api.createNote).mock.calls[0][0]
    expect(createPayload.content).toContain('https://player.bilibili.com/player.html?bvid=BV1xx411c7mD')
    expect(createPayload.content).toContain('data-ai-source-card="video"')
    expect(await screen.findByText('B站 demo video')).toBeTruthy()
  })

  it('accepts dropped files in the AI panel', async () => {
    const files = [new File(['# Dropped'], 'dropped.md', { type: 'text/markdown' })]
    vi.spyOn(api, 'previewImportFiles').mockResolvedValue({
      items: [
        {
          file_name: 'dropped.md',
          file_type: 'md',
          size: 9,
          title: 'Dropped',
          status: 'ok',
          message: '',
          summary: 'Dropped source.',
          block_count: 1,
        },
      ],
    })

    render(<SidebarTree selectedNodeId={null} onNodeSelect={vi.fn()} />)
    openAiPanel()

    fireEvent.drop(screen.getByTestId('ai-import-panel'), {
      dataTransfer: {
        files,
        getData: () => '',
      },
    })

    await waitFor(() => {
      expect(api.previewImportFiles).toHaveBeenCalledWith(files)
    })
    expect(await screen.findByText('dropped.md')).toBeTruthy()
  })

  it('accepts dropped urls in the AI panel', async () => {
    vi.spyOn(api, 'previewImportUrls').mockResolvedValue({
      items: [
        {
          file_name: 'https://example.com/drop',
          file_type: 'url',
          size: 120,
          title: 'Dropped URL',
          status: 'ok',
          message: '',
          summary: 'Dropped link source.',
          block_count: 1,
        },
      ],
    })

    render(<SidebarTree selectedNodeId={null} onNodeSelect={vi.fn()} />)
    openAiPanel()

    fireEvent.drop(screen.getByTestId('ai-import-panel'), {
      dataTransfer: {
        files: [],
        getData: (type: string) => (type === 'text/uri-list' ? 'https://example.com/drop' : ''),
      },
    })

    await waitFor(() => {
      expect(api.previewImportUrls).toHaveBeenCalledWith(['https://example.com/drop'])
    })
    expect((await screen.findAllByText('https://example.com/drop')).length).toBeGreaterThan(0)
  })

  it('restores ask-this-import for a selected imported note after reload', async () => {
    vi.spyOn(api, 'askImportBatch').mockResolvedValue({
      answer: 'Restored batch answer.',
      citations: [{ note_id: 202, title: 'AI Import - Restored', chunk_id: 'import-batch-202', score: 1, excerpt: 'Restored source.' }],
      mode: 'import_batch',
    })
    useNoteStore.getState().setNotes([
      {
        ...aiGeneratedNote,
        id: 202,
        title: 'AI Import - Restored',
        properties: [
          { id: 1, note_id: 202, name: 'import_batch_id', type: 'text', value: 'imp_restored' },
          { id: 2, note_id: 202, name: 'import_source_type', type: 'text', value: 'url' },
          {
            id: 3,
            note_id: 202,
            name: 'import_sources',
            type: 'text',
            value: JSON.stringify([
              { kind: 'url', url: 'https://example.com/post', title: 'Example post' },
              { kind: 'file', name: 'brief.md', title: 'Brief' },
            ]),
          },
        ],
      },
    ])
    window.localStorage.setItem('nova.ai.importChat.imp_restored', JSON.stringify([
      { id: 'saved-user', role: 'user', text: '之前问过的问题' },
      { id: 'saved-assistant', role: 'assistant', text: '之前保留的回答。', citations: [] },
    ]))

    render(<SidebarTree selectedNodeId="202" onNodeSelect={vi.fn()} />)
    openAiPanel()

    expect(await screen.findByText('引用来源')).toBeTruthy()
    expect(await screen.findByText('之前问过的问题')).toBeTruthy()
    expect(screen.getByText('之前保留的回答。')).toBeTruthy()
    expect(screen.getByText('Example post')).toBeTruthy()
    expect(screen.getByText('https://example.com/post')).toBeTruthy()
    expect(screen.getByText('Brief')).toBeTruthy()
    expect(screen.getByText('brief.md')).toBeTruthy()

    fireEvent.change(await screen.findByLabelText('ask-import-batch-input'), { target: { value: '继续总结' } })
    fireEvent.click(screen.getByRole('button', { name: 'ask-import-batch' }))

    await waitFor(() => {
      expect(api.askImportBatch).toHaveBeenCalledWith('imp_restored', '继续总结')
    })
    expect(await screen.findByText('Restored batch answer.')).toBeTruthy()
  })

  it('appends generated source content to the selected note', async () => {
    const onNodeSelect = vi.fn()
    useNoteStore.getState().setNotes([
      {
        ...aiGeneratedNote,
        id: 301,
        title: 'Existing Note',
        content: '<h1>Existing Note</h1><p>Original</p>',
        properties: [],
      },
    ])
    vi.spyOn(api, 'previewImportUrls').mockResolvedValue({
      items: [
        {
          file_name: 'https://example.com/update',
          file_type: 'url',
          size: 128,
          title: 'Update source',
          status: 'ok',
          message: '',
          summary: 'New material.',
          block_count: 2,
        },
      ],
    })
    vi.spyOn(api, 'importUrlsAndGenerateNote').mockResolvedValue({
      title: 'AI Import - Update source',
      markdown: '## 摘要\nNew material.\n\n## 引用资料\n- 链接: [Update source](https://example.com/update)',
      source_type: 'url',
      metadata: {
        template_id: 'general',
        import_batch_id: 'imp_update',
        source_refs: [{ kind: 'url', url: 'https://example.com/update', title: 'Update source' }],
      },
    })
    vi.spyOn(api, 'updateNote').mockResolvedValue({
      ...aiGeneratedNote,
      id: 301,
      title: 'Existing Note',
      content: '<h1>Existing Note</h1><p>Original</p><hr data-ai-import-update="true" /><h2>AI Import - Update source</h2>',
      properties: [
        { id: 1, note_id: 301, name: 'import_batch_id', type: 'text', value: 'imp_update' },
      ],
    })

    render(<SidebarTree selectedNodeId="301" onNodeSelect={onNodeSelect} />)
    openAiPanel()

    fireEvent.click(screen.getByRole('button', { name: 'ai-workbench-mode-import' }))
    fireEvent.change(screen.getByLabelText('ai-import-url-input'), { target: { value: 'https://example.com/update' } })
    fireEvent.click(screen.getByRole('button', { name: 'preview-ai-import-url' }))

    await waitFor(() => {
      expect(api.previewImportUrls).toHaveBeenCalledWith(['https://example.com/update'])
    })
    fireEvent.click(screen.getByRole('button', { name: 'append-ai-import-note' }))

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(301, expect.objectContaining({
        content: expect.stringContaining('data-ai-import-update="true"'),
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'import_batch_id', type: 'text', value: 'imp_update' }),
        ]),
      }))
    })
    expect(onNodeSelect).toHaveBeenCalledWith('301')
  })

  it('asks questions about the currently selected note when it is not an import batch', async () => {
    const onNodeSelect = vi.fn()
    useNoteStore.getState().setNotes([
      {
        ...aiGeneratedNote,
        id: 401,
        title: 'Project Note',
        content: '<h1>Project Note</h1><p>核心内容</p>',
        properties: [],
      },
    ])
    vi.spyOn(api, 'askNote').mockResolvedValue({
      answer: '这篇笔记主要讲项目内容。[1]',
      citations: [{ note_id: 401, title: 'Project Note', chunk_id: 'note-401', score: 1, excerpt: '核心内容' }],
      mode: 'note',
    })
    vi.spyOn(api, 'updateNote').mockResolvedValue({
      ...aiGeneratedNote,
      id: 401,
      title: 'Project Note',
      content: '<h1>Project Note</h1><p>核心内容</p><hr data-ai-chat-insert="true" /><p>这篇笔记主要讲项目内容。<span data-type="footnote" data-index="1" data-content="Project Note：核心内容"></span></p>',
      properties: [],
    })

    render(<SidebarTree selectedNodeId="401" onNodeSelect={onNodeSelect} />)
    openAiPanel()

    expect(await screen.findByText('当前笔记问答')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'ai-ask-scope-select' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ask-suggested-总结核心要点' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('ask-import-batch-input'), { target: { value: '这篇讲了什么？' } })
    fireEvent.click(screen.getByRole('button', { name: 'ask-import-batch' }))

    await waitFor(() => {
      expect(api.askNote).toHaveBeenCalledWith('401', '这篇讲了什么？')
    })
    expect(await screen.findByText('这篇笔记主要讲项目内容。[1]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /insert-ai-answer-/ }))
    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(401, expect.objectContaining({
        content: expect.stringContaining('data-type="footnote"'),
      }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'open-import-citation-401' }))
    expect(onNodeSelect).toHaveBeenCalledWith('401')
  })

  it('runs a writing action and inserts the result into the selected note', async () => {
    const onNodeSelect = vi.fn()
    useNoteStore.getState().setNotes([
      {
        ...aiGeneratedNote,
        id: 501,
        title: 'Writing Note',
        content: '<h1>Writing Note</h1><p>核心内容</p>',
        properties: [],
      },
    ])
    vi.spyOn(api, 'streamInlineAI').mockImplementation(async (_payload, onChunk) => {
      onChunk('## 摘要\n')
      onChunk('核心内容总结')
    })
    vi.spyOn(api, 'updateNote').mockResolvedValue({
      ...aiGeneratedNote,
      id: 501,
      title: 'Writing Note',
      content: '<h1>Writing Note</h1><p>核心内容</p><hr data-ai-write-insert="true" /><h2>摘要</h2><p>核心内容总结</p>',
      properties: [],
    })

    render(<SidebarTree selectedNodeId="501" onNodeSelect={onNodeSelect} />)
    openAiPanel()

    fireEvent.click(screen.getByRole('button', { name: 'ai-workbench-mode-write' }))
    fireEvent.click(screen.getByRole('button', { name: 'run-ai-write-summarize' }))

    await waitFor(() => {
      expect(api.streamInlineAI).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'summarize',
          context: expect.stringContaining('核心内容'),
        }),
        expect.any(Function),
      )
    })
    expect((await screen.findByTestId('ai-write-result')).textContent).toContain('核心内容总结')

    fireEvent.click(screen.getByRole('button', { name: 'insert-ai-write-result' }))
    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(501, expect.objectContaining({
        content: expect.stringContaining('data-ai-write-insert="true"'),
      }))
    })
    expect(onNodeSelect).toHaveBeenCalledWith('501')
  })
})
