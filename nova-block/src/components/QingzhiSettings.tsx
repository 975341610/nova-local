/**
 * SettingsDialog patch — 清知主题专属设置块
 * --------------------------------------------------------------------
 * 在现有 src/components/SettingsDialog.tsx 中插入下面 3 个区域：
 *   1) 主题选择项里追加 "清知"
 *   2) 立绘水印透明度滑块（0 ~ 0.6，默认 0.18）
 *   3) 顶栏 4 常驻按钮自定义（dnd-kit 拖拽 + 增减）
 *
 * 下面给出可直接 import 的子组件 QingzhiSettings.tsx，由
 * SettingsDialog.tsx 在 isQingzhi 时挂载即可，避免侵入主面板代码。
 */
import React from 'react';
import {
  DndContext, closestCenter,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQingzhiTopbarConfig } from '../config/qingzhiTopbarConfig';

const ICON_SPRITE = '/assets/qingzhi/icons/sprite.svg';
const ALL: Record<string, { icon: string; label: string }> = {
  calendar:  { icon: 'calendar',  label: '日历'     },
  command:   { icon: 'command',   label: '命令面板' },
  reading:   { icon: 'reading',   label: '阅读'     },
  inspector: { icon: 'inspector', label: '检视'     },
  graph:     { icon: 'graph',     label: '图谱'     },
  ai:        { icon: 'ai',        label: 'AI 灵感'  },
  bell:      { icon: 'bell',      label: '提醒'     },
  todo:      { icon: 'todo',      label: '待办'     },
  sync:      { icon: 'sync',      label: '同步状态' },
  export:    { icon: 'export',    label: '导出'     },
};

function SortableChip({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const meta = ALL[id];
  return (
    <div ref={setNodeRef} style={style} className="qz-chip" {...attributes} {...listeners}>
      <svg width={16} height={16} viewBox="0 0 24 24"><use href={`${ICON_SPRITE}#qz-i-${meta.icon}`} /></svg>
      <span>{meta.label}</span>
    </div>
  );
}

export default function QingzhiSettings() {
  const { pinned, setPinned, MAX_PINNED } = useQingzhiTopbarConfig();
  const sensors = useSensors(useSensor(PointerSensor));

  const [opacity, setOpacity] = React.useState<number>(() => {
    const v = parseFloat(localStorage.getItem('qz.mascot.opacity') || '0.18');
    return isFinite(v) ? v : 0.18;
  });
  React.useEffect(() => {
    document.documentElement.style.setProperty('--qz-mascot-opacity', String(opacity));
    localStorage.setItem('qz.mascot.opacity', String(opacity));
  }, [opacity]);

  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      localStorage.setItem('qz.avatar.src', url);
      window.dispatchEvent(new CustomEvent('qz:avatar-changed'));
    };
    reader.readAsDataURL(f);
  };

  const onResetAvatar = () => {
    localStorage.removeItem('qz.avatar.src');
    window.dispatchEvent(new CustomEvent('qz:avatar-changed'));
  };

  const candidates = Object.keys(ALL).filter(k => !pinned.includes(k));

  return (
    <div className="qz-settings-block">
      <h3>清知主题</h3>

      <section>
        <label>侧栏立绘透明度</label>
        <input type="range" min={0} max={0.6} step={0.02}
               value={opacity}
               onChange={e => setOpacity(parseFloat(e.target.value))} />
        <span>{Math.round(opacity * 100)}%</span>
      </section>

      <section>
        <label>顶栏常驻按钮（最多 {MAX_PINNED} 个，可拖拽排序）</label>
        <DndContext sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => {
                      if (!e.over || e.active.id === e.over.id) return;
                      const oldI = pinned.indexOf(String(e.active.id));
                      const newI = pinned.indexOf(String(e.over.id));
                      setPinned(arrayMove(pinned, oldI, newI));
                    }}>
          <SortableContext items={pinned} strategy={horizontalListSortingStrategy}>
            <div className="qz-chip-row">
              {pinned.map(id => (
                <div key={id} className="qz-chip-wrap">
                  <SortableChip id={id} />
                  <button onClick={() => setPinned(pinned.filter(x => x !== id))}>×</button>
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {pinned.length < MAX_PINNED && (
          <div className="qz-chip-row qz-chip-row-candidates">
            {candidates.map(id => (
              <button key={id}
                      className="qz-chip qz-chip-add"
                      onClick={() => setPinned([...pinned, id])}>
                + {ALL[id].label}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <label>个人头像</label>
        <input type="file" accept="image/*" onChange={onAvatarPick} />
        <button onClick={onResetAvatar}>恢复默认</button>
      </section>
    </div>
  );
}
