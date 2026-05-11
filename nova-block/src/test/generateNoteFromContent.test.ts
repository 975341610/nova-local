import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';

describe('AI generated note api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a structured note from normalized imported content', async () => {
    const payload = {
      source_type: 'file',
      title: '项目复盘',
      blocks: [{ type: 'paragraph', text: '完成远程 AI 修复', metadata: {} }],
      plain_text: '完成远程 AI 修复',
      metadata: { source_name: 'retro.md' },
    };
    const response = {
      title: '项目复盘',
      markdown: '## 摘要\n完成远程 AI 修复',
      source_type: 'file',
      metadata: { source_name: 'retro.md' },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(api.generateNoteFromContent(payload)).resolves.toEqual(response);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/ai/generate-note-from-content');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(payload));
  });

  it('generates and persists a structured note for knowledge base Q&A indexing', async () => {
    const payload = {
      source_type: 'file',
      title: '项目复盘',
      blocks: [],
      plain_text: '完成远程 AI 修复',
      metadata: {},
    };
    const response = {
      generated: { title: '项目复盘', markdown: '## 摘要\n内容', source_type: 'file', metadata: {} },
      note: { id: 1, title: '项目复盘', icon: '🤖', summary: '', tags: ['AI整理'], properties: [], links: [], ai_links: [], notebook_id: 1, parent_id: null, position: 0, is_title_manually_edited: false, created_at: '2026-05-09T00:00:00' },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(api.generateAndPersistNoteFromContent(payload)).resolves.toEqual(response);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/ai/generate-note-from-content/persist');
    expect(init?.method).toBe('POST');
  });
});
