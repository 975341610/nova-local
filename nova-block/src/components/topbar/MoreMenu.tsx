import React from 'react';

const ICON_SPRITE = '/assets/qingzhi/icons/sprite.svg';

function I({ id }: { id: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <use href={`${ICON_SPRITE}#qz-i-${id}`} />
    </svg>
  );
}

export default function MoreMenu({
  allButtons,
  onCommand,
  onClose,
}: {
  allButtons: Record<string, { icon: string; label: string; cmd: string }>;
  onCommand: (cmd: string) => void;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.qz-pool')) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="qz-pool"
         style={{ position: 'absolute', top: 44, right: 12, minWidth: 180 }}>
      {Object.entries(allButtons).map(([key, meta]) => (
        <div key={key}
             className="qz-pool-item"
             onClick={() => onCommand(meta.cmd)}>
          <I id={meta.icon} />
          <span>{meta.label}</span>
          <button className="qz-pool-add" title="固定到顶栏">+</button>
        </div>
      ))}
    </div>
  );
}
