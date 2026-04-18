import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { FileText, Search } from 'lucide-react';

export interface SuggestionProps {
  items: any[];
  command: (props: any) => void;
  query?: string;
}

export const NoteLinkSuggestion = forwardRef((props: SuggestionProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ id: item.id, label: item.title });
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }

      if (event.key === 'Enter') {
        if (!props.items || props.items.length === 0) return false;
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      if (event.key === 'Tab') {
        if (!props.items || props.items.length === 0) return false;
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  if (props.items.length === 0) {
    return (
      <div className="flex flex-col gap-1 p-2 bg-popover/80 backdrop-blur-xl border border-border/10 rounded-2xl shadow-soft w-64 overflow-hidden z-[100000]">
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Search size={14} />
          <span>未找到相关笔记 "{props.query}"</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-1 bg-popover/80 backdrop-blur-xl border border-border/10 rounded-2xl shadow-soft w-64 overflow-hidden overflow-y-auto max-h-[300px] scrollbar-hide z-[100000]">
      <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">选择笔记 (Link to Note)</div>
      {props.items.map((item, index) => (
        <button
          key={item.id}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            selectItem(index);
          }}
          onMouseDown={(e) => {
            // 防止点击按钮时编辑器失去焦点，从而导致 Suggestion 菜单过早关闭
            e.preventDefault();
            e.stopPropagation();
          }}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xl transition-all duration-200 text-left ${
            index === selectedIndex ? 'bg-accent text-foreground shadow-sm scale-[1.02]' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary">
            {item.icon || <FileText size={14} />}
          </div>
          <span className="truncate flex-1">{item.title}</span>
        </button>
      ))}
    </div>
  );
});

NoteLinkSuggestion.displayName = 'NoteLinkSuggestion';
