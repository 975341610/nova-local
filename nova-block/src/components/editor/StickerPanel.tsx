import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Search, Image as ImageIcon, Plus, Loader2 } from 'lucide-react';
import { getApiBase, formatUrl } from '../../lib/api';
import { HoverPlayImage } from './HoverPlayImage';

interface StickerResource {
  name: string;
  url: string;
  thumb_url: string;
}

interface StickerPanelProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export const StickerPanel: React.FC<StickerPanelProps> = ({ onSelect, onClose }) => {
  const [stickers, setStickers] = useState<StickerResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStickers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getApiBase()}/stickers/list`);
      const data = await res.json();
      setStickers(data);
    } catch (err) {
      console.error('Failed to fetch stickers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStickers();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch(`${getApiBase()}/stickers/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        await fetchStickers();
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation(); // 阻止触发选中事件
    if (!window.confirm('确定要从贴纸库删除此贴纸吗？')) return;

    try {
      const res = await fetch(`${getApiBase()}/stickers/files/${filename}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStickers(prev => prev.filter(s => s.name !== filename));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filteredStickers = stickers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed bottom-24 right-8 z-[100] w-80 h-[450px] bg-white/80 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-white/20 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 pb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
          <ImageIcon size={20} className="text-pink-400" />
          贴纸库
        </h3>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Search & Upload bar */}
      <div className="px-6 mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
          <input 
            type="text" 
            placeholder="搜索贴纸..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-stone-100/50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-pink-200 transition-all outline-none"
          />
        </div>
        <label className="flex items-center justify-center w-10 h-10 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl cursor-pointer shadow-lg shadow-pink-200 transition-all active:scale-95">
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={20} />}
          <input type="file" className="hidden" onChange={handleUpload} accept="image/*" disabled={uploading} />
        </label>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 gap-3">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-xs">加载灵感中...</span>
          </div>
        ) : filteredStickers.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {filteredStickers.map((sticker, idx) => {
              return (
                <div key={sticker.name} className="relative group">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(formatUrl(sticker.url))}
                      draggable={true}
                      onDragStart={(e: React.DragEvent<HTMLButtonElement>) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          url: formatUrl(sticker.url),
                          type: 'image',
                          name: sticker.name,
                        }));
  
                        // 设置拖拽预览图
                        const img = e.currentTarget.querySelector('img');
                        if (img) {
                          e.dataTransfer.setDragImage(img, 50, 50);
                        }
                      }}
                      className="w-full aspect-square bg-stone-50 rounded-2xl overflow-hidden hover:ring-4 hover:ring-pink-100 transition-all active:scale-90 cursor-grab active:cursor-grabbing"
                    >
                      <HoverPlayImage
                        src={formatUrl(sticker.url)}
                        thumbSrc={formatUrl(sticker.thumb_url || sticker.url)}
                        alt={sticker.name}
                        className="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform"
                      />
                    </button>
                  </motion.div>
                  <button
                    onClick={(e) => handleDelete(e, sticker.name)}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-white shadow-md border border-stone-100 rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all z-10"
                    title="删除贴纸"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 gap-2">
            <ImageIcon size={32} strokeWidth={1} />
            <span className="text-xs">还没有贴纸，快去上传吧</span>
          </div>
        )}
      </div>

      {/* Footer / Decorative */}
      <div className="px-6 py-3 bg-stone-50/50 border-t border-stone-100 flex items-center justify-center">
        <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Sticker System v1.0</span>
      </div>
    </motion.div>
  );
};
