import React, { useState, useRef, useEffect } from 'react';
import type { Note } from '../../lib/types';
import { api } from '../../lib/api';
import { 
  MapPin,
  Clock,
  Sparkles,
  Tag,
  ChevronDown,
  ChevronUp,
  X,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Smile,
  Meh,
  Frown,
  Coffee,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAI } from '../../contexts/AIContext';

interface PropertyPanelProps {
  note: Note;
  onUpdate: (updatedFields: Partial<Note>) => void;
  onUpdateTags?: (noteId: number, tags: string[]) => Promise<void>;
  onFlushSave?: (updates: Partial<Note>) => void;
}

const WEATHER_OPTIONS = [
  { value: 'sunny', icon: Sun, label: '晴天' },
  { value: 'cloudy', icon: Cloud, label: '多云' },
  { value: 'rainy', icon: CloudRain, label: '下雨' },
  { value: 'snowy', icon: Snowflake, label: '下雪' },
  { value: 'stormy', icon: CloudLightning, label: '雷阵雨' },
];

const MOOD_OPTIONS = [
  { value: 'happy', icon: Smile, label: '开心' },
  { value: 'normal', icon: Meh, label: '平静' },
  { value: 'sad', icon: Frown, label: '难过' },
  { value: 'relaxed', icon: Coffee, label: '放松' },
  { value: 'energetic', icon: Zap, label: '充满活力' },
];

export const PropertyPanel: React.FC<PropertyPanelProps> = ({ note, onUpdate, onUpdateTags, onFlushSave }) => {
  const { isAiEnabled } = useAI();
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(false);
  const [manualTag, setManualTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(note.tags || []);
  
  // Sync local tags with prop when note changes
  useEffect(() => {
    // 使用 Set 进行去重，确保 localTags 中没有重复标签
    const uniqueTags = Array.from(new Set(note.tags || []));
    setLocalTags(uniqueTags);
  }, [note.id, note.tags]);

  // 初始化时读取一次
  const initialLocation = note.properties?.find(p => p.name === 'Location' || p.name === '地点')?.value || '';
  const initialWeather = note.properties?.find(p => p.name === 'Weather' || p.name === '天气')?.value || 'sunny';
  const initialMood = note.properties?.find(p => p.name === 'Mood' || p.name === '心情')?.value || 'happy';

  const [localProperties, setLocalProperties] = useState(note.properties || []);
  
  // 只有当 note 实体改变时才重置 localProperties (比如切换笔记)
  useEffect(() => {
    setLocalProperties(note.properties || []);
  }, [note.id]);

  const [localLocation, setLocalLocation] = useState(initialLocation);
  const [localWeather, setLocalWeather] = useState(initialWeather);
  const [localMood, setLocalMood] = useState(initialMood);

  // 切换笔记时重置天气和心情
  useEffect(() => {
    const w = (note.properties || []).find(p => p.name === 'Weather' || p.name === '天气')?.value || 'sunny';
    const m = (note.properties || []).find(p => p.name === 'Mood' || p.name === '心情')?.value || 'happy';
    const l = (note.properties || []).find(p => p.name === 'Location' || p.name === '地点')?.value || '';
    setLocalWeather(w);
    setLocalMood(m);
    setLocalLocation(l);
  }, [note.id]);
  const [isFocused, setIsFocused] = useState(false);
  const lastSyncValueRef = useRef(initialLocation);

  const [isWeatherOpen, setIsWeatherOpen] = useState(false);
  const [isMoodOpen, setIsMoodOpen] = useState(false);

  const weatherRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef<HTMLDivElement>(null);

  // Click outside to close popovers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (weatherRef.current && !weatherRef.current.contains(event.target as Node)) {
        setIsWeatherOpen(false);
      }
      if (moodRef.current && !moodRef.current.contains(event.target as Node)) {
        setIsMoodOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSuggestTags = async () => {
    setIsSuggesting(true);
    setIsSuggestionsExpanded(true);
    try {
      const response = await api.suggestTags(note.content || "");
      // AI 建议的标签也要去重，且不能包含已有的标签
      const uniqueSuggestedTags = Array.from(new Set(response.tags || []))
        .filter(tag => !localTags.includes(tag));
      setSuggestedTags(uniqueSuggestedTags);
    } catch (error) {
      console.error('Failed to suggest tags:', error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const applyTag = async (tagName: string) => {
    const tag = tagName.trim();
    if (!tag || localTags.includes(tag)) return;
    
    const newTags = [...localTags, tag];
    setLocalTags(newTags);
    if (onUpdateTags) {
      onUpdateTags(note.id, newTags);
    } else {
      onUpdate({ tags: newTags });
    }
    setSuggestedTags(prev => prev.filter(t => t !== tag));
  };

  const handleManualAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && manualTag.trim()) {
      e.preventDefault();
      const tag = manualTag.trim();
      if (!localTags.includes(tag)) {
        const newTags = [...localTags, tag];
        setLocalTags(newTags);
    if (onUpdateTags) {
      onUpdateTags(note.id, newTags);
    } else {
      onUpdate({ tags: newTags });
    }
      }
      setManualTag('');
    }
  };

  // 完全切断与外部属性值的强行同步，只在初始化时获取
  // 让组件内部完全接管和维护天气和心情状态
  // 仅当地点没有被 focus 时才同步一下外部更新
  useEffect(() => {
    const w = (note.properties || []).find(p => p.name === 'Location' || p.name === '地点')?.value || '';
    if (!isFocused && w !== localLocation) {
      if (w === lastSyncValueRef.current) return;
      setLocalLocation(w);
      lastSyncValueRef.current = w;
    }
  }, [note.properties, isFocused, localLocation]);

  const handleUpdateLocation = async (value: string) => {
    setLocalLocation(value);
  };

  const handleBlur = async () => {
    const loc = (note.properties || []).find(p => p.name === 'Location' || p.name === '地点')?.value || '';
    if (localLocation === loc) {
      setIsFocused(false);
      return;
    }
    lastSyncValueRef.current = localLocation;
    await handleUpdateProperty('Location', localLocation);
    setIsFocused(false);
  };

  const handleUpdateProperty = async (propName: string, value: string) => {
    try {
      const properties = [...localProperties];
      const targetPropIdx = properties.findIndex(p => p.name === propName || (propName === 'Weather' && p.name === '天气') || (propName === 'Mood' && p.name === '心情'));
      
      if (propName === 'Weather') setLocalWeather(value);
      if (propName === 'Mood') setLocalMood(value);
      
      let newProps;
      if (targetPropIdx > -1) {
        newProps = properties.map((p, idx) => idx === targetPropIdx ? { ...p, value } : p);
      } else {
        newProps = [...properties, {
          name: propName,
          type: propName === 'Location' ? 'text' : 'select',
          value: value
        } as any];
      }
      
      setLocalProperties(newProps);
      
      // 如果有 onFlushSave，则立即触发全量保存（合并最新内容，彻底解决覆盖问题）
      if (typeof onFlushSave === 'function') {
        onFlushSave({ properties: newProps });
      } else {
        // Fallback: 如果没有 onFlushSave，仅更新本地状态由 editor 自动保存触发
        onUpdate({ properties: newProps });
      }
    } catch (error) {
      console.error(`Failed to update ${propName}:`, error);
    }
  };

  const handleSelectWeather = (value: string) => {
    setLocalWeather(value);
    setIsWeatherOpen(false);
    handleUpdateProperty('Weather', value);
  };

  const handleSelectMood = (value: string) => {
    setLocalMood(value);
    setIsMoodOpen(false);
    handleUpdateProperty('Mood', value);
  };

  const formattedTime = new Date(note.created_at).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const displayTags = isExpanded ? localTags : localTags.slice(0, 5);
  const hasMoreTags = localTags.length > 5;

  const CurrentWeatherIcon = WEATHER_OPTIONS.find(o => o.value === localWeather)?.icon || Sun;
  const CurrentMoodIcon = MOOD_OPTIONS.find(o => o.value === localMood)?.icon || Smile;

  return (
    <div className="px-0 py-1 space-y-2 mb-0 border-b border-reflect-border/10">
      {/* Tags Area */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center min-h-[24px]">
        {/* Existing Tags Display */}
        {localTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            {displayTags.map(tag => (
              <span 
                key={tag} 
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-reflect-sidebar/60 text-reflect-text rounded-md text-[10px] font-medium border border-reflect-border/30 hover:border-reflect-accent/30 transition-colors"
              >
                {tag}
                <button 
                  onClick={() => {
                    const newTags = localTags.filter(t => t !== tag);
                    setLocalTags(newTags);
    if (onUpdateTags) {
      onUpdateTags(note.id, newTags);
    } else {
      onUpdate({ tags: newTags });
    }
                  }}
                  className="opacity-40 hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </span>
            ))}
            
            {hasMoreTags && !isExpanded && (
              <button 
                onClick={() => setIsExpanded(true)}
                title={`显示其余 ${localTags.length - 5} 个标签 (Expand)`}
                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-reflect-muted/40 hover:text-reflect-accent hover:bg-reflect-sidebar/50 transition-colors"
              >
                <span className="text-[10px] font-bold">+{localTags.length - 5}</span>
                <ChevronDown size={12} />
              </button>
            )}
            
            {hasMoreTags && isExpanded && (
              <button 
                onClick={() => setIsExpanded(false)}
                title="收起标签 (Collapse)"
                className="flex items-center justify-center p-0.5 rounded text-reflect-muted/40 hover:text-reflect-accent hover:bg-reflect-sidebar/50 transition-colors"
              >
                <ChevronUp size={12} />
              </button>
            )}
          </div>
        )}

        {/* Manual Add Tag */}
        <div className="flex items-center gap-2 group/tag-input">
          <Tag size={12} className="text-reflect-muted/40" />
          <input
            type="text"
            value={manualTag}
            onChange={(e) => setManualTag(e.target.value)}
            onKeyDown={handleManualAddTag}
            placeholder="Add tag..."
            className="w-20 transition-all bg-transparent text-[11px] text-reflect-text focus:outline-none placeholder:text-reflect-muted/30"
          />
        </div>

        {/* AI Suggest Button */}
        {isAiEnabled && (
        <button 
          onClick={handleSuggestTags}
          disabled={isSuggesting}
          title={isSuggesting ? '分析中 (Analyzing...)' : 'AI 智能标签 (AI Insights)'}
          className={`flex items-center justify-center p-1.5 rounded-md transition-all ${isSuggesting ? 'bg-amber-500/10 text-amber-500 animate-pulse' : 'text-amber-500/50 hover:text-amber-500 hover:bg-amber-500/10'}`}
        >
          <Sparkles size={13} />
        </button>
        )}

        {/* Suggestion Toggle */}
        {suggestedTags.length > 0 && (
          <button 
            onClick={() => setIsSuggestionsExpanded(!isSuggestionsExpanded)}
            title={isSuggestionsExpanded ? '隐藏建议 (Hide Suggestions)' : `显示建议 (Show ${suggestedTags.length} Suggestions)`}
            className="flex items-center gap-1 p-1.5 rounded-md text-amber-500/50 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
          >
            <span className="text-[10px] font-bold font-mono">{suggestedTags.length}</span>
            {isSuggestionsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Suggested Tags (Collapsible) */}
      <AnimatePresence>
        {isSuggestionsExpanded && suggestedTags.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 items-center p-2 mt-1 bg-amber-50/50 rounded-lg border border-amber-100/50 overflow-hidden"
          >
            <Sparkles size={10} className="text-amber-600/50 ml-1" />
            {suggestedTags.map(tag => (
              <button 
                key={tag} 
                onClick={() => applyTag(tag)}
                title={`添加标签: ${tag}`}
                className="px-2 py-0.5 bg-white text-amber-700 border border-amber-200/50 rounded-md text-[10px] font-medium hover:bg-amber-50 transition-colors shadow-sm"
              >
                {tag}
              </button>
            ))}
            <button 
              onClick={() => {
                setSuggestedTags([]);
                setIsSuggestionsExpanded(false);
              }}
              title="清空建议 (Clear)"
              className="ml-auto p-1 rounded-md text-amber-600/40 hover:text-rose-500 hover:bg-rose-50/50 transition-all"
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Simplified Properties Area - Horizontal Layout */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
        {/* Created Time - Read Only */}
        <div 
          className="flex items-center gap-1.5 p-1.5 rounded-md text-reflect-muted/40 hover:text-reflect-muted hover:bg-reflect-sidebar/50 transition-colors cursor-default"
          title={`创建时间: ${formattedTime}`}
        >
          <Clock size={13} />
          <span className="text-[10px] font-medium tracking-wide">{formattedTime}</span>
        </div>

        {/* Location - Editable */}
        <div className="flex items-center gap-1.5 min-w-[120px] max-w-[200px]">
          <MapPin size={13} className="text-reflect-muted/40 shrink-0" />
          <input
            type="text"
            value={localLocation}
            onChange={(e) => handleUpdateLocation(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            placeholder="Add location..."
            className="w-full bg-transparent text-[11px] text-reflect-text font-medium focus:outline-none transition-all placeholder:text-reflect-muted/30"
          />
        </div>

        {/* Weather Selector */}
        <div className="relative" ref={weatherRef}>
          <button 
            onClick={() => setIsWeatherOpen(!isWeatherOpen)}
            title="选择天气"
            className={`flex items-center gap-1.5 p-1.5 rounded-md transition-colors ${isWeatherOpen ? 'bg-reflect-sidebar/50 text-reflect-text' : 'text-reflect-muted/40 hover:text-reflect-muted hover:bg-reflect-sidebar/50'}`}
          >
            <CurrentWeatherIcon size={14} strokeWidth={2.5} />
          </button>
          
          <AnimatePresence>
            {isWeatherOpen && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute top-8 left-0 flex bg-white dark:bg-stone-900 border border-stone-200/50 dark:border-stone-800/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-lg p-1 z-50 backdrop-blur-xl"
              >
                {WEATHER_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleSelectWeather(option.value)}
                      title={option.label}
                      className={`p-2 rounded-md transition-colors ${localWeather === option.value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' : 'text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300'}`}
                    >
                      <Icon size={14} strokeWidth={2.5} />
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mood Selector */}
        <div className="relative" ref={moodRef}>
          <button 
            onClick={() => setIsMoodOpen(!isMoodOpen)}
            title="选择心情"
            className={`flex items-center gap-1.5 p-1.5 rounded-md transition-colors ${isMoodOpen ? 'bg-reflect-sidebar/50 text-reflect-text' : 'text-reflect-muted/40 hover:text-reflect-muted hover:bg-reflect-sidebar/50'}`}
          >
            <CurrentMoodIcon size={14} strokeWidth={2.5} />
          </button>

          <AnimatePresence>
            {isMoodOpen && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute top-8 left-0 flex bg-white dark:bg-stone-900 border border-stone-200/50 dark:border-stone-800/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-lg p-1 z-50 backdrop-blur-xl"
              >
                {MOOD_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleSelectMood(option.value)}
                      title={option.label}
                      className={`p-2 rounded-md transition-colors ${localMood === option.value ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-500' : 'text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300'}`}
                    >
                      <Icon size={14} strokeWidth={2.5} />
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};
