import React from 'react';
import { Wand2, Languages, Table } from 'lucide-react';
import type { AIActionKind } from '../../../lib/novablock/aiActions';

interface AIBubbleActionsProps {
  onAction: (kind: AIActionKind) => void;
  /** 模型调用进行中: 锁定全部按钮避免重复触发 */
  loading?: boolean;
  className?: string;
}

const ACTIONS: Array<{
  kind: AIActionKind;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  testId: string;
}> = [
  { kind: 'rewrite', label: '重写', Icon: Wand2, testId: 'qingzhi-ai-action-rewrite' },
  { kind: 'translate', label: '翻译', Icon: Languages, testId: 'qingzhi-ai-action-translate' },
  { kind: 'convert-to-table', label: '转表格', Icon: Table, testId: 'qingzhi-ai-action-convert-to-table' },
];

/**
 * F3 · BubbleMenu 上的 AI 动作按钮组.
 * 与具体编辑器解耦: 只负责 UI + 派发 onAction(kind),
 * 调用方负责取选区文本、调 runAIAction、把结果回写到编辑器.
 */
export const AIBubbleActions: React.FC<AIBubbleActionsProps> = ({
  onAction,
  loading = false,
  className = '',
}) => {
  return (
    <div
      data-testid="qingzhi-ai-bubble-actions"
      className={`inline-flex items-center gap-1 px-1 py-0.5 ${className}`}
    >
      {ACTIONS.map(({ kind, label, Icon, testId }) => (
        <button
          key={kind}
          type="button"
          data-testid={testId}
          disabled={loading}
          onClick={() => onAction(kind)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={label}
        >
          <Icon size={14} className="shrink-0" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};

export default AIBubbleActions;
