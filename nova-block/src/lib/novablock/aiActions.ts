/**
 * F3 · AI BubbleMenu actions (pure module + transport-injected runner)
 *
 * 设计原则:
 *  - buildPrompt / parseAIResult 是纯函数,易测、可复用
 *  - runAIAction 接受可注入的 transport,默认实现走全局 ai gateway,
 *    但测试可以传 mock transport,从而 不依赖真实模型/网络
 */

export type AIActionKind = 'rewrite' | 'translate' | 'convert-to-table';

export interface AIActionInput {
  kind: AIActionKind;
  text: string;
}

export interface AITransportPayload extends AIActionInput {
  prompt: string;
}

export type AITransport = (payload: AITransportPayload) => Promise<string>;

export interface RunAIActionOptions {
  transport?: AITransport;
}

/** 每个 kind 的核心指令模板 */
const PROMPT_TEMPLATES: Record<AIActionKind, (text: string) => string> = {
  rewrite: (text) =>
    `请重写下面的文本,保持原意不变,提升流畅度和表达,只输出改写后的内容:\n\n${text}`,
  translate: (text) =>
    `请翻译下面的文本(中文则译为英文,其它语言译为中文),只输出译文,不要解释:\n\n${text}`,
  'convert-to-table': (text) =>
    `请把下面的文本转换为一个 Markdown table。第一行是表头,使用 | 分隔列,第二行用 | --- | 分隔,只输出 Markdown 表格:\n\n${text}`,
};

export function buildPrompt(kind: AIActionKind, text: string): string {
  const tpl = PROMPT_TEMPLATES[kind];
  if (!tpl) throw new Error(`Unknown AI action kind: ${kind}`);
  return tpl(text);
}

/**
 * Round 3 · Bug A — 后端 schemas.py 把 `action` 字段约束为下面的 Literal 白名单:
 *   "continue" | "expand" | "summarize" | "rewrite" | "translate" | "outline" | "ask" | "search"
 * 前端 inline AI 的 kind 不一定能直接对上,这里做一次显式映射:
 *  - rewrite           → rewrite          (后端原生支持)
 *  - translate         → translate        (后端原生支持)
 *  - convert-to-table  → rewrite          (后端没有该枚举,降级到 rewrite,真正的指令在 prompt 里)
 *  - custom            → ask              (自定义指令走 ask)
 *  - 未知 kind          → ask              (退化兜底,绝不抛、绝不污染请求)
 */
export type BackendAIAction =
  | 'continue'
  | 'expand'
  | 'summarize'
  | 'rewrite'
  | 'translate'
  | 'outline'
  | 'ask'
  | 'search';

const KIND_TO_BACKEND_ACTION: Record<string, BackendAIAction> = {
  rewrite: 'rewrite',
  translate: 'translate',
  'convert-to-table': 'rewrite',
  custom: 'ask',
};

export function kindToBackendAction(
  kind: AIActionKind | 'custom' | string,
): BackendAIAction {
  return KIND_TO_BACKEND_ACTION[kind as string] ?? 'ask';
}

/**
 * 对模型输出做最小化清洗:
 *  - 剥去常见的 ```markdown / ```table / ``` 围栏
 *  - 修剪首尾空白
 */
export function parseAIResult(_kind: AIActionKind, raw: string): string {
  if (typeof raw !== 'string') return '';
  let out = raw.trim();
  // 顶层围栏: ```xxx\n...\n```
  const fenceMatch = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenceMatch) {
    out = fenceMatch[1].trim();
  }
  return out;
}

/**
 * 默认 transport:占位实现,生产环境会被 wire-up 替换为真正的 AI gateway 调用.
 * 在没有注入时直接 reject,迫使调用方显式注入 transport(避免静默失败).
 */
const defaultTransport: AITransport = async () => {
  throw new Error('AI transport not configured');
};

export async function runAIAction(
  input: AIActionInput,
  options: RunAIActionOptions = {}
): Promise<string> {
  const text = input.text ?? '';
  // 空 / 仅空白:直接返回原文,避免无意义的网络请求
  if (text.trim().length === 0) {
    return text;
  }
  const transport = options.transport ?? defaultTransport;
  const prompt = buildPrompt(input.kind, text);
  try {
    const raw = await transport({ ...input, prompt });
    return parseAIResult(input.kind, raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`AI action [${input.kind}] failed: ${reason}`);
  }
}
