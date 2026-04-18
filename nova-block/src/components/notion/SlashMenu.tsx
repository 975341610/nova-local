import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Type } from 'lucide-react';

export type SlashItem = {
  group: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
  keywords: string[];
  action: (chain: any, editor?: any) => void;
  requiresAI?: boolean;
};

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  useEffect(() => {
    const activeItem = scrollContainerRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (items.length === 0) return null;

  // 将项目按组分类
  const groups: { name: string; items: { item: SlashItem; originalIndex: number }[] }[] = [];
  items.forEach((item, index) => {
    let group = groups.find(g => g.name === item.group);
    if (!group) {
      group = { name: item.group, items: [] };
      groups.push(group);
    }
    group.items.push({ item, originalIndex: index });
  });

  return (
    <div 
      className="notion-slash-menu slash-menu-glass z-[120] min-w-[320px] max-h-[320px] flex flex-col overflow-hidden rounded-3xl border shadow-soft"
      style={{
        opacity: 'var(--slash-menu-opacity, 0.8)',
        backdropFilter: 'blur(var(--slash-menu-blur, 20px))',
        backgroundColor: 'var(--slash-menu-bg, rgba(var(--popover), 0.8))',
        color: 'var(--slash-menu-fg, inherit)',
        borderColor: 'var(--slash-menu-border, rgba(var(--border), 0.2))',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div 
        ref={scrollContainerRef}
        className="overflow-y-auto p-2 custom-scrollbar"
      >
        {groups.map((group) => (
          <div key={group.name} className="mb-3 last:mb-0">
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
              {group.name}
            </div>
            <div className="flex flex-col gap-1">
              {group.items.map(({ item, originalIndex: index }) => (
                <button
                  key={`${item.group}-${item.label}`}
                  data-index={index}
                  className={`flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-left transition-all duration-300 group/item ${
                    index === selectedIndex ? 'bg-primary/10 shadow-sm shadow-primary/5' : 'hover:bg-accent/50'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectItem(index);
                  }}
                  onMouseMove={() => setSelectedIndex(index)}
                >
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border/10 bg-background/50 shadow-sm transition-all duration-300 ${
                    index === selectedIndex ? 'text-primary scale-110 ring-1 ring-primary/20' : 'text-muted-foreground'
                  }`}>
                    {item.icon || <Type size={18} />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className={`text-[13px] font-bold truncate transition-colors ${
                      index === selectedIndex ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {item.label}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground/60 font-medium">
                      {item.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

SlashMenu.displayName = 'SlashMenu';

