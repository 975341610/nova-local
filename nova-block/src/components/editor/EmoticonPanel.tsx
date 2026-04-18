import React, { useState, useEffect } from 'react';
import { Search, Smile, Plus, Loader2, X } from 'lucide-react';
import { getApiBase, formatUrl } from '../../lib/api';
import { HoverPlayImage } from './HoverPlayImage';

interface EmoticonResource {
  name: string;
  url: string;
  thumb_url: string;
}

interface EmoticonPanelProps {
  onSelect: (emoticon: EmoticonResource) => void;
  className?: string;
}

export const EmoticonPanel: React.FC<EmoticonPanelProps> = ({ onSelect, className = "" }) => {
  const [emoticons, setEmoticons] = useState<EmoticonResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEmoticons = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getApiBase()}/emoticons/list`);
      const data = await res.json();
      setEmoticons(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch emoticons:', err);
      setEmoticons([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmoticons();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch(`${getApiBase()}/emoticons/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        await fetchEmoticons();
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这个表情吗？')) return;

    try {
      const res = await fetch(`${getApiBase()}/emoticons/files/${filename}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setEmoticons(prev => (Array.isArray(prev) ? prev : []).filter(s => s.name !== filename));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filteredEmoticons = (Array.isArray(emoticons) ? emoticons : []).filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`w-72 flex flex-col bg-popover border border-border rounded-xl shadow-xl overflow-hidden ${className}`}>
      {/* Search & Upload bar */}
      <div className="p-3 border-b border-border flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
          <input 
            type="text" 
            placeholder="搜索表情..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 bg-accent/50 border-none rounded-lg text-xs focus:ring-1 focus:ring-primary/30 transition-all outline-none"
          />
        </div>
        <label className="flex items-center justify-center w-8 h-8 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg cursor-pointer transition-all active:scale-95">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
          <input type="file" className="hidden" onChange={handleUpload} accept="image/*" disabled={uploading} />
        </label>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-3 max-h-64 custom-scrollbar min-h-[200px]">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[10px]">加载中...</span>
          </div>
        ) : filteredEmoticons.length > 0 ? (
          <div className="grid grid-cols-5 gap-2">
            {filteredEmoticons.map((emoticon) => {
              return (
                <div key={emoticon.name} className="relative group">
                  <button
                    onClick={() => onSelect(emoticon)}
                    className="w-full aspect-square flex items-center justify-center p-1 bg-accent/30 rounded-lg hover:bg-accent hover:ring-2 hover:ring-primary/20 transition-all active:scale-90"
                  >
                    <HoverPlayImage 
                      src={formatUrl(emoticon.url)} 
                      thumbSrc={formatUrl(emoticon.thumb_url || emoticon.url)}
                      alt={emoticon.name}
                      className="w-full h-full object-contain"
                    />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, emoticon.name)}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-background shadow-sm border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all z-10"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
            <Smile size={24} strokeWidth={1} />
            <span className="text-[10px]">没有找到表情</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2 bg-accent/30 border-t border-border flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Emoticons</span>
        <span className="text-[9px] text-muted-foreground">{emoticons.length} items</span>
      </div>
    </div>
  );
};
