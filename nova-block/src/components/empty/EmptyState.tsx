import React from 'react';

const STICKERS: Record<string, string> = {
  'first-launch':  '/assets/qingzhi/stickers/01-hello.webp',
  'empty-folder':  '/assets/qingzhi/stickers/02-focused.webp',
  'no-search':     '/assets/qingzhi/stickers/03-thinking.webp',
  'ai-empty':      '/assets/qingzhi/stickers/18-ai-summary.webp',
  'no-backlinks':  '/assets/qingzhi/stickers/13-hmm.webp',
  'load-error':    '/assets/qingzhi/stickers/09-late-night.webp',
};

const TITLES: Record<string, string> = {
  'first-launch': '落笔，便是开始。',
  'empty-folder': '这里还没有笔记，先种一颗。',
  'no-search':    '翻遍所有，未见此句。',
  'ai-empty':     '等你给我一段文字。',
  'no-backlinks': '暂无人引用此处。',
  'load-error':   '暂时打了个盹，稍后再试。',
};

const HINTS: Record<string, string> = {
  'first-launch': '无任何笔记 · 首次启动',
  'empty-folder': '当前文件夹为空',
  'no-search':    '搜索无结果',
  'ai-empty':     'AI 导入面板',
  'no-backlinks': '反链面板为空',
  'load-error':   '网络 / 加载错误',
};

export type EmptyKind = keyof typeof STICKERS;

export default function EmptyState({
  kind,
  title,
  hint,
  action,
}: {
  kind: EmptyKind;
  title?: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="qz-empty">
      <img className="qz-empty-mascot" src={STICKERS[kind]} alt="" />
      <div className="qz-empty-title">{title ?? TITLES[kind]}</div>
      <div className="qz-empty-hint">{hint ?? HINTS[kind]}</div>
      {action}
    </div>
  );
}
