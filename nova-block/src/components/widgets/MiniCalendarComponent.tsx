import React, { useMemo, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const palette = {
  bg: 'bg-[#F6F3EF]',
  card: 'bg-white/70',
  text: 'text-[#2E2A2A]',
  subtle: 'text-[#6E6868]',
  border: 'border-[#E6DFD8]',
  accent: 'bg-[#B7C0C7]',
};

const week = ['一', '二', '三', '四', '五', '六', '日'];

function isoDay(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export const MiniCalendarComponent: React.FC<any> = (props) => {
  const { editor, node, updateAttributes, selected } = props;
  const isEditable = editor?.isEditable;

  const title = node?.attrs?.title || '打卡日历';
  const checked: string[] = Array.isArray(node?.attrs?.checkedDates) ? node.attrs.checkedDates : [];

  const [cursor, setCursor] = useState(() => new Date());

  const days = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const list = eachDayOfInterval({ start, end });
    // Monday = 1 ... Sunday = 7
    const firstDow = Number(format(start, 'i'));
    const pad = firstDow - 1;
    const padded: (Date | null)[] = [...Array.from({ length: pad }, () => null), ...list];
    // pad tail to full weeks
    const tail = (7 - (padded.length % 7)) % 7;
    return [...padded, ...Array.from({ length: tail }, () => null)];
  }, [cursor]);

  const toggleDay = (d: Date) => {
    const key = isoDay(d);
    const next = checked.includes(key) ? checked.filter((x) => x !== key) : [...checked, key];
    updateAttributes({ checkedDates: next });
  };

  return (
    <NodeViewWrapper
      className={`my-5 rounded-3xl border ${palette.border} ${palette.bg} shadow-soft overflow-hidden ${selected ? 'ring-2 ring-black/10' : ''}`}
      data-drag-handle
    >
      <div className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-sm font-semibold tracking-wide ${palette.text}`}>{title}</div>
            <div className={`mt-1 text-xs ${palette.subtle}`}>{format(cursor, 'yyyy 年 MM 月')}</div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-9 h-9 rounded-xl border border-black/10 bg-white/60 hover:bg-white transition-colors flex items-center justify-center"
              onClick={() => setCursor((d) => subMonths(d, 1))}
            >
              <ChevronLeft size={16} className="text-black/50" />
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-xl border border-black/10 bg-white/60 hover:bg-white transition-colors flex items-center justify-center"
              onClick={() => setCursor((d) => addMonths(d, 1))}
            >
              <ChevronRight size={16} className="text-black/50" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2">
          {week.map((w) => (
            <div key={w} className="text-[11px] font-bold text-black/35 text-center tracking-widest">
              {w}
            </div>
          ))}

          {days.map((d, idx) => {
            if (!d) return <div key={`empty-${idx}`} />;

            const inMonth = isSameMonth(d, cursor);
            const key = isoDay(d);
            const hit = checked.includes(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() => inMonth && toggleDay(d)}
                className={`h-9 rounded-xl border text-sm font-bold tabular-nums transition-all ${
                  inMonth ? 'border-black/10 bg-white/60 hover:bg-white' : 'border-transparent bg-transparent'
                } ${hit ? `${palette.accent} text-white border-transparent shadow` : 'text-black/60'}`}
                disabled={!inMonth || !isEditable}
                title={isEditable ? (hit ? '取消打卡' : '打卡') : '只读'}
              >
                {format(d, 'd')}
              </button>
            );
          })}
        </div>

        {isEditable && (
          <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white/40 px-4 py-3">
            <div className="text-[11px] font-semibold text-black/40 tracking-widest">快捷</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-black/10 bg-white/60 hover:bg-white transition-colors"
                onClick={() => updateAttributes({ checkedDates: [] })}
              >
                清空
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-black/10 bg-white/60 hover:bg-white transition-colors"
                onClick={() => setCursor(new Date())}
              >
                回到本月
              </button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
