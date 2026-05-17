/**
 * Top bar — qingzhi theme
 * --------------------------------------------------------------------
 * Replaces the previous bottom floating toolbar with:
 *   left:   logo (玉印 + "清知" + 小花)
 *   center: drag region
 *   right:  4 pinned icons + ⋯ MoreMenu + Avatar + system controls (— □ ×)
 * ------------------------------------------------------------------ */
import React from 'react';
import { useQingzhiTopbarConfig } from '../../config/qingzhiTopbarConfig';
import MoreMenu from './MoreMenu';
import Avatar from './Avatar';

const ICON_SPRITE = '/assets/qingzhi/icons/sprite.svg';

function I({ id, size = 18 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <use href={`${ICON_SPRITE}#qz-i-${id}`} />
    </svg>
  );
}

const ALL_BUTTONS: Record<string, { icon: string; label: string; cmd: string }> = {
  calendar:  { icon: 'calendar',  label: '日历',     cmd: 'open:calendar'    },
  command:   { icon: 'command',   label: '命令面板', cmd: 'open:command'     },
  reading:   { icon: 'reading',   label: '阅读',     cmd: 'open:reading'     },
  inspector: { icon: 'inspector', label: '检视',     cmd: 'open:inspector'   },
  graph:     { icon: 'graph',     label: '图谱',     cmd: 'open:graph'       },
  ai:        { icon: 'ai',        label: 'AI 灵感',  cmd: 'open:ai'          },
  bell:      { icon: 'bell',      label: '提醒',     cmd: 'open:bell'        },
  todo:      { icon: 'todo',      label: '待办',     cmd: 'open:todo'        },
  sync:      { icon: 'sync',      label: '同步状态', cmd: 'open:sync'        },
  export:    { icon: 'export',    label: '导出',     cmd: 'open:export'      },
};

export default function TopBar({
  onCommand,
  onMin, onMax, onClose,
}: {
  onCommand: (cmd: string) => void;
  onMin: () => void; onMax: () => void; onClose: () => void;
}) {
  const { pinned } = useQingzhiTopbarConfig();   // ['calendar','command','reading','inspector']
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <header className="qz-topbar">
      <div className="qz-topbar-left">
        <div className="qz-logo">
          <img className="qz-logo-stamp"  src="/assets/qingzhi/decoration/stamp.svg"  alt="" />
          <span className="qz-logo-text">清知</span>
          <img className="qz-logo-flower" src="/assets/qingzhi/decoration/flower.svg" alt="" />
        </div>
      </div>

      <div className="qz-topbar-center" />

      <div className="qz-topbar-right">
        {pinned.map(key => {
          const meta = ALL_BUTTONS[key];
          if (!meta) return null;
          return (
            <button key={key}
                    className="qz-iconbtn"
                    title={meta.label}
                    onClick={() => onCommand(meta.cmd)}>
              <I id={meta.icon} />
            </button>
          );
        })}

        <button className="qz-iconbtn"
                title="更多"
                onClick={() => setMoreOpen(v => !v)}>
          <I id="more" />
        </button>

        <Avatar />

        <div className="qz-topbar-divider" />

        <div className="qz-syscontrols">
          <button className="qz-sysbtn"       title="最小化" onClick={onMin}>
            <svg viewBox="0 0 12 12" width="12" height="12">
              <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
          <button className="qz-sysbtn"       title="最大化" onClick={onMax}>
            <svg viewBox="0 0 12 12" width="12" height="12">
              <rect x="2.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            </svg>
          </button>
          <button className="qz-sysbtn close" title="关闭"   onClick={onClose}>
            <svg viewBox="0 0 12 12" width="12" height="12">
              <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>

        {moreOpen && (
          <MoreMenu allButtons={ALL_BUTTONS}
                    onCommand={(c) => { onCommand(c); setMoreOpen(false); }}
                    onClose={() => setMoreOpen(false)} />
        )}
      </div>
    </header>
  );
}
