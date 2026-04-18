import React, { useEffect, useMemo, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { differenceInSeconds, isValid, parseISO, addDays, addHours, addMinutes, addSeconds, format } from 'date-fns';
import { Settings, Calendar, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const flipTheme = {
  bg: 'bg-[#F0F0F3]', // 新拟态经典底色
  card: 'bg-[#F0F0F3]',
  text: 'text-stone-600',
  subtle: 'text-stone-400',
  border: 'border-white/20',
  accent: 'text-blue-500', 
  // 新拟态阴影
  shadowOut: 'shadow-[6px_6px_12px_#b8b9be,-6px_-6px_12px_#ffffff]',
  shadowIn: 'shadow-[inset_2px_2px_5px_#b8b9be,inset_-2px_-2px_5px_#ffffff]',
  shadowInDeep: 'shadow-[inset_4px_4px_8px_#b8b9be,inset_-4px_-4px_8px_#ffffff]',
};

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

/**
 * FlipUnit: 极其稳定且符合物理规律的纯 CSS 翻页组件
 */

const FlipUnit: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [currentValue, setCurrentValue] = useState(value);
  const [oldValue, setOldValue] = useState(value);

  useEffect(() => {
    if (value !== currentValue) {
      setOldValue(currentValue);
      setCurrentValue(value);
    }
  }, [value, currentValue]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative w-12 h-16 md:w-16 md:h-22 rounded-xl ${flipTheme.shadowOut} perspective-1000 select-none bg-[#F0F0F3]`}>
        
        {/* 层 1: 底板上半部 (静态，显示 currentValue) */}
        <div className={`absolute top-0 left-0 right-0 bottom-1/2 overflow-hidden rounded-t-xl border-b border-stone-200/50 ${flipTheme.card} flex items-end justify-center pb-[1px]`}>
          <span className={`translate-y-1/2 ${flipTheme.text} font-bold text-3xl md:text-5xl tabular-nums`}>{currentValue}</span>
        </div>

        {/* 层 2: 底板下半部 (静态，显示 oldValue) */}
        <div className={`absolute top-1/2 left-0 right-0 bottom-0 overflow-hidden rounded-b-xl ${flipTheme.card} flex items-start justify-center pt-[1px]`}>
          <span className={`-translate-y-1/2 ${flipTheme.text} font-bold text-3xl md:text-5xl tabular-nums`}>{oldValue}</span>
        </div>

        {/* 动态翻页层: key 绑定 currentValue，数字改变时重新创建该 DOM，触发完整 CSS 动画 */}
        {currentValue !== oldValue && (
          <div
            key={currentValue}
            className="absolute top-0 left-0 right-0 bottom-1/2 z-10 flip-animation-card"
            style={{ transformOrigin: "bottom center", transformStyle: "preserve-3d" }}
          >
            {/* 翻页面正面: 显示 oldValue (上半部) */}
            <div 
              className={`absolute inset-0 w-full h-full overflow-hidden rounded-t-xl border-b border-stone-200/50 ${flipTheme.card} flex items-end justify-center pb-[1px] backface-hidden`}
            >
              <span className={`translate-y-1/2 ${flipTheme.text} font-bold text-3xl md:text-5xl tabular-nums`}>{oldValue}</span>
            </div>
            
            {/* 翻页面背面: 显示 currentValue (下半部)，由于翻到-180度，本身颠倒，需 rotateX(180deg) 扶正 */}
            <div 
              className={`absolute inset-0 w-full h-full overflow-hidden rounded-b-xl ${flipTheme.card} flex items-start justify-center pt-[1px] backface-hidden`}
              style={{ transform: "rotateX(180deg)" }}
            >
              <span className={`-translate-y-1/2 ${flipTheme.text} font-bold text-3xl md:text-5xl tabular-nums`}>{currentValue}</span>
            </div>
          </div>
        )}

        {/* 中缝阴影 */}
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-stone-300/30 z-20" />
      </div>
      <span className={`text-[9px] md:text-[10px] font-bold tracking-widest uppercase ${flipTheme.subtle}`}>{label}</span>
    </div>
  );
};


function safeParseISO(v: string | undefined): Date | null {
  if (!v) return null;
  try {
    const d = parseISO(v);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

export const CountdownComponent: React.FC<any> = (props) => {
  const { editor, node, updateAttributes, selected } = props;
  const isEditable = editor?.isEditable;

  const [now, setNow] = useState(() => Date.now());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings Temp State
  const [mode, setMode] = useState<'duration' | 'date'>('duration');
  const [duration, setDuration] = useState({ days: '0', hours: '0', minutes: '0', seconds: '0' });
  const [targetDateTime, setTargetDateTime] = useState('');
  const [showBubble, setShowBubble] = useState(node?.attrs?.showBubble ?? false);

  const target = useMemo(() => safeParseISO(node?.attrs?.targetDate), [node?.attrs?.targetDate]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const diff = useMemo(() => {
    if (!target) return 0;
    return differenceInSeconds(target, new Date(now));
  }, [target, now]);

  const { days, hours, minutes, seconds, isOver } = useMemo(() => {
    const s = Math.max(0, diff);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    // 确保返回的是字符串，并且经过 pad2 处理
    return { 
      days: String(d), 
      hours: pad2(h), 
      minutes: pad2(m), 
      seconds: pad2(sec), 
      isOver: diff <= 0 
    };
  }, [diff]);

  const title = node?.attrs?.title ?? '倒计时';

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
    if (target) {
      setTargetDateTime(format(target, "yyyy-MM-dd'T'HH:mm"));
    } else {
      setTargetDateTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    }
    setDuration({ days: '0', hours: '0', minutes: '0', seconds: '0' });
    setShowBubble(node?.attrs?.showBubble ?? false);
  };

  const handleConfirm = () => {
    let nextDate: Date;
    if (mode === 'duration') {
      nextDate = new Date();
      nextDate = addDays(nextDate, parseInt(duration.days) || 0);
      nextDate = addHours(nextDate, parseInt(duration.hours) || 0);
      nextDate = addMinutes(nextDate, parseInt(duration.minutes) || 0);
      nextDate = addSeconds(nextDate, parseInt(duration.seconds) || 0);
    } else {
      nextDate = parseISO(targetDateTime);
    }

    if (isValid(nextDate)) {
      updateAttributes({
        targetDate: nextDate.toISOString(),
        showBubble: showBubble,
      });
    }
    setIsSettingsOpen(false);
  };

  const isAlerting = isOver && showBubble;

  return (
    <NodeViewWrapper
      className={`my-6 max-w-lg mx-auto p-1 overflow-hidden select-none ${selected ? 'ring-2 ring-blue-500/20 rounded-[2.5rem]' : ''}`}
      data-drag-handle
    >
      <div className={`relative p-8 md:p-10 rounded-[2.2rem] ${flipTheme.bg} ${flipTheme.shadowOut} overflow-hidden border border-white/40 ${isAlerting ? 'ring-4 ring-orange-400/30 animate-pulse border-orange-200/50' : ''}`}>
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between mb-8">
          <div>
            <h3 className={`text-lg md:text-xl font-bold tracking-tight ${flipTheme.text}`}>
              {title}
            </h3>
            <p className={`mt-0.5 text-[9px] md:text-[10px] font-medium ${flipTheme.subtle} tracking-wider uppercase`}>
              {target ? `目标日期: ${format(target, 'yyyy.MM.dd HH:mm')}` : '尚未设置目标日期'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${flipTheme.shadowIn} bg-stone-50/30`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isOver ? (isAlerting ? 'bg-orange-500 animate-bounce' : 'bg-stone-300') : 'bg-blue-400 animate-pulse'}`} />
              <span className={`text-[8px] font-bold tracking-widest uppercase ${flipTheme.subtle}`}>
                {isOver ? '已结束' : '进行中'}
              </span>
            </div>
            
            {isEditable && (
              <button
                onClick={handleOpenSettings}
                title="设置"
                className={`p-2.5 rounded-xl ${flipTheme.shadowOut} hover:scale-105 active:scale-95 transition-all cursor-pointer bg-[#F0F0F3]`}
              >
                <Settings size={14} className="text-stone-500" />
              </button>
            )}
          </div>
        </div>

        {/* Flip Clock Display */}
        <div className="relative z-10 flex justify-center items-center gap-2 md:gap-4">
          <FlipUnit value={days} label="天" />
          <div className={`text-2xl md:text-3xl font-light self-center -translate-y-4 ${flipTheme.subtle} opacity-40`}>:</div>
          <FlipUnit value={hours} label="时" />
          <div className={`text-2xl md:text-3xl font-light self-center -translate-y-4 ${flipTheme.subtle} opacity-40`}>:</div>
          <FlipUnit value={minutes} label="分" />
          <div className={`text-2xl md:text-3xl font-light self-center -translate-y-4 ${flipTheme.subtle} opacity-40`}>:</div>
          <FlipUnit value={seconds} label="秒" />
        </div>

        {/* Settings Panel Overlay */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-white/10 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`w-full max-w-[280px] p-6 rounded-[2rem] ${flipTheme.bg} ${flipTheme.shadowOut} border border-white/60 relative`}
              >
                <div className="flex items-center justify-between mb-5">
                  <h4 className={`text-xs font-bold ${flipTheme.text} uppercase tracking-wider`}>设置</h4>
                  <button 
                    onClick={() => setIsSettingsOpen(false)} 
                    title="关闭"
                    className={`p-1.5 rounded-lg ${flipTheme.shadowOut} hover:text-red-400 transition-colors bg-[#F0F0F3]`}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-5">
                  {/* Mode Toggle with Icons */}
                  <div className={`flex p-1 rounded-xl ${flipTheme.shadowIn} bg-stone-100/20`}>
                    <button
                      onClick={() => setMode('duration')}
                      title="倒计时长模式"
                      className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-all ${mode === 'duration' ? `${flipTheme.shadowOut} bg-[#F0F0F3] text-blue-500` : 'text-stone-400 opacity-60'}`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-tighter">时长</span>
                    </button>
                    <button
                      onClick={() => setMode('date')}
                      title="目标日期模式"
                      className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-all ${mode === 'date' ? `${flipTheme.shadowOut} bg-[#F0F0F3] text-blue-500` : 'text-stone-400 opacity-60'}`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-tighter">日期</span>
                    </button>
                  </div>

                  {mode === 'duration' ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '天', key: 'days' },
                        { label: '时', key: 'hours' },
                        { label: '分', key: 'minutes' },
                        { label: '秒', key: 'seconds' },
                      ].map((f) => (
                        <div key={f.key} className="flex flex-col items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            value={duration[f.key as keyof typeof duration]}
                            onChange={(e) => setDuration({ ...duration, [f.key]: e.target.value })}
                            className={`w-full py-2 rounded-lg ${flipTheme.shadowIn} bg-[#F0F0F3] text-center font-bold ${flipTheme.text} text-sm focus:outline-none border-none`}
                          />
                          <span className={`text-[8px] font-bold ${flipTheme.subtle} uppercase tracking-tighter`}>{f.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${flipTheme.shadowIn} bg-[#F0F0F3]`}>
                      <Calendar size={12} className="text-stone-400" />
                      <input
                        type="datetime-local"
                        value={targetDateTime}
                        onChange={(e) => setTargetDateTime(e.target.value)}
                        className={`flex-1 bg-transparent border-none outline-none text-[10px] font-bold ${flipTheme.text} focus:ring-0 uppercase`}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 px-1">
                    <label htmlFor="showBubble" className={`text-[9px] font-bold ${flipTheme.subtle} cursor-pointer select-none uppercase tracking-wide`}>
                      到期提醒
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showBubble}
                        onChange={(e) => setShowBubble(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className={`w-8 h-4 rounded-full ${flipTheme.shadowIn} peer-checked:bg-blue-400/20 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 after:shadow-sm`}></div>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleConfirm}
                  title="确认修改"
                  className={`w-full mt-6 py-2.5 rounded-xl ${flipTheme.shadowOut} hover:scale-[1.02] active:scale-[0.98] transition-all bg-[#F0F0F3] text-blue-500 font-bold flex items-center justify-center gap-2`}
                >
                  <Check size={16} strokeWidth={3} />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        @keyframes flipDown {
          0% { transform: rotateX(0deg); }
          100% { transform: rotateX(-180deg); }
        }
        .flip-animation-card {
          animation: flipDown 0.6s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
        }
      `}</style>
    </NodeViewWrapper>
  );
};
