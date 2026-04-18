import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Settings, ChevronLeft, ChevronRight, Plus, X, Trash2, Upload, Image as ImageIcon, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatUrl } from '../../../lib/api';

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="flex items-center justify-between gap-4 cursor-pointer group">
    <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">{label}</span>
    <div
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 ease-in-out ${
        checked ? 'bg-blue-500' : 'bg-gray-200'
      }`}
    >
      <motion.div
        animate={{ x: checked ? 20 : 2 }}
        initial={false}
        className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
      />
    </div>
  </label>
);

export const SliderNodeView: React.FC<any> = ({ node, updateAttributes }) => {
  const images = Array.isArray(node.attrs.images) ? node.attrs.images : [];
  const { autoPlay, showDots, showArrows, visibleCount = 5 } = node.attrs;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const wheelTimeout = useRef<any>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const nextSlide = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const prevSlide = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (autoPlay && images.length > 1 && !isSettingsOpen) {
      const interval = setInterval(nextSlide, 3000);
      return () => clearInterval(interval);
    }
  }, [autoPlay, images.length, nextSlide, isSettingsOpen]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (wheelTimeout.current) return;

    if (e.deltaY > 0) {
      nextSlide();
    } else if (e.deltaY < 0) {
      prevSlide();
    }

    wheelTimeout.current = setTimeout(() => {
      wheelTimeout.current = null;
    }, 300);
  }, [nextSlide, prevSlide]);

  useEffect(() => {
    const carouselEl = carouselRef.current;
    if (carouselEl) {
      carouselEl.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (carouselEl) {
        carouselEl.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  useEffect(() => {
    const lightboxEl = lightboxRef.current;
    if (isLightboxOpen && lightboxEl) {
      lightboxEl.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (lightboxEl) {
        lightboxEl.removeEventListener('wheel', handleWheel);
      }
    };
  }, [isLightboxOpen, handleWheel]);

  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const fileList = Array.from(files);
      const results = await api.upload(fileList);
      const uploadedUrls = results.map((res: any) => res.url);
      
      updateAttributes({
        images: [...images, ...uploadedUrls],
      });
    } catch (err) {
      console.error('Slider upload failed:', err);
      alert('上传失败，请稍后重试');
    } finally {
      setIsUploading(false);
    }
  };

  const addImage = () => {
    if (newImageUrl.trim()) {
      updateAttributes({
        images: [...images, newImageUrl.trim()],
      });
      setNewImageUrl('');
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_: any, i: number) => i !== index);
    updateAttributes({ images: newImages });
    setFailedImages((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    if (currentIndex >= newImages.length && newImages.length > 0) {
      setCurrentIndex(newImages.length - 1);
    } else if (newImages.length === 0) {
      setCurrentIndex(0);
    }
  };

  const renderCoverflow = () => {
    return (
      <div 
        ref={carouselRef}
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
      >
        <AnimatePresence initial={false}>
          {images.map((url: string, index: number) => {
            let diff = index - currentIndex;
            
            // Handle wrap-around diff for smoother transitions
            if (diff > images.length / 2) diff -= images.length;
            if (diff < -images.length / 2) diff += images.length;

            const absDiff = Math.abs(diff);
            
            // Logic for visibleCount: 
            // If visibleCount is 4, we want index (0), and then 3 more. 
            // For odd, it's balanced. For even, one side will have more.
            // Let's use a logic that works for both:
            const leftVisible = Math.floor((visibleCount - 1) / 2);
            const rightVisible = visibleCount - 1 - leftVisible;
            const isVisible = (diff >= -leftVisible && diff <= rightVisible);

            if (!isVisible) return null;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.5, x: diff * 100 }}
                animate={{
                  opacity: 1,
                  scale: Math.max(0.3, 1 - absDiff * 0.15),
                  x: `${diff === 0 ? 0 : Math.sign(diff) * (absDiff * 12 + 12)}%`,
                  zIndex: 50 - absDiff,
                  filter: `brightness(${Math.max(0.2, 1 - absDiff * 0.2)}) blur(${absDiff * 1}px)`,
                }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 300, 
                  damping: 30,
                  filter: { type: 'tween', duration: 0.3, ease: "easeOut" } 
                }}
                className="absolute w-2/3 aspect-video rounded-xl shadow-2xl overflow-hidden bg-gray-200 border border-white/20 cursor-pointer"
                onClick={() => {
                  if (index === currentIndex) {
                    setIsLightboxOpen(true);
                  } else {
                    setCurrentIndex(index);
                  }
                }}
              >
                {failedImages.has(index) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400">
                    <AlertCircle size={48} className="mb-2" />
                    <span className="text-sm">图片加载失败</span>
                  </div>
                ) : (
                    <img
                    src={formatUrl(url)}
                    alt={`Slide ${index + 1}`}
                    className="w-full h-full object-cover select-none !m-0"
                    onError={() => setFailedImages((prev) => new Set(prev).add(index))}
                  />
                )}
                {index === currentIndex && (
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center group/center">
                    <div className="opacity-0 group-hover/center:opacity-100 transform translate-y-4 group-hover/center:translate-y-0 transition-all bg-white/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/30 text-white text-sm font-medium">
                      点击放大
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {showArrows && images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); prevSlide(); }}
              className="absolute left-4 z-[100] p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/20"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); nextSlide(); }}
              className="absolute right-4 z-[100] p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/20"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {showDots && images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[100] px-3 py-2 bg-black/20 backdrop-blur-md rounded-full">
            {images.map((_: any, idx: number) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        )}

        {/* Lightbox Implementation */}
        <AnimatePresence>
          {isLightboxOpen && (
            <motion.div
              ref={lightboxRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 sm:p-12 cursor-zoom-out"
              onClick={() => setIsLightboxOpen(false)}
            >
              <button 
                onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
                className="absolute top-8 right-8 p-4 text-white hover:bg-white/10 rounded-full transition-all z-[1010] shadow-2xl"
              >
                <X size={48} strokeWidth={2} />
              </button>

              <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                <motion.img
                  key={currentIndex}
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  src={formatUrl(images[currentIndex])}
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg !m-0"
                />

                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); prevSlide(); }}
                      className="absolute left-0 p-4 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all"
                    >
                      <ChevronLeft size={48} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); nextSlide(); }}
                      className="absolute right-0 p-4 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all"
                    >
                      <ChevronRight size={48} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <NodeViewWrapper className="slider-node my-8 relative group select-none">
      <div className="relative w-full aspect-[21/9] bg-transparent rounded-2xl overflow-hidden">
        {images.length > 0 ? (
          renderCoverflow()
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-stone-500 bg-stone-50/50 dark:bg-stone-900/50 border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-2xl m-1">
            <div className="p-4 bg-white dark:bg-stone-800 rounded-full mb-4 shadow-sm">
              <Plus size={48} className="text-stone-400" />
            </div>
            <p className="font-medium text-lg text-stone-600 dark:text-stone-300">开启 Coverflow 画廊之旅</p>
            <p className="text-sm opacity-60 mt-1">点击右上角设置图标上传或添加图片</p>
          </div>
        )}

        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="absolute top-4 right-4 z-[110] p-2 bg-white/80 dark:bg-stone-800/80 hover:bg-white dark:hover:bg-stone-700 backdrop-blur-md rounded-xl shadow-lg text-stone-600 dark:text-stone-300 border border-stone-200/50 dark:border-stone-700/50 transition-all opacity-0 group-hover:opacity-100"
        >
          <Settings size={20} />
        </button>
      </div>

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 right-0 mt-4 z-[120] p-6 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Slider 设置面板</h3>
                <p className="text-sm text-gray-500">定制您的 2.5D Coverflow 画廊体验</p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">交互配置</h4>
                  <div className="bg-gray-50 p-4 rounded-xl space-y-4">
                    <Toggle label="自动轮播" checked={autoPlay} onChange={(v) => updateAttributes({ autoPlay: v })} />
                    <Toggle label="显示分页指示器" checked={showDots} onChange={(v) => updateAttributes({ showDots: v })} />
                    <Toggle label="显示侧边导航" checked={showArrows} onChange={(v) => updateAttributes({ showArrows: v })} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">布局配置</h4>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="block text-sm font-medium text-gray-600 mb-2">可见层级数量 (支持偶数/单张): {visibleCount}</label>
                    <input
                      type="range"
                      min="1"
                      max="11"
                      step="1"
                      value={visibleCount}
                      onChange={(e) => updateAttributes({ visibleCount: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-1">
                      <span>1</span>
                      <span>3</span>
                      <span>5</span>
                      <span>7</span>
                      <span>9</span>
                      <span>11</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">媒体管理</h4>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="输入图片链接..."
                      className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && addImage()}
                    />
                    <ImageIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                  <button
                    onClick={addImage}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                  >
                    <Plus size={18} />
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="slider-file-upload"
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="slider-file-upload"
                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-xl transition-all group ${
                      isUploading ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                    }`}
                  >
                    {isUploading ? (
                      <Loader2 size={24} className="text-blue-500 mb-2 animate-spin" />
                    ) : (
                      <Upload size={24} className="text-gray-400 group-hover:text-blue-500 mb-2" />
                    )}
                    <span className="text-sm font-medium text-gray-600 group-hover:text-blue-600">{isUploading ? '上传中...' : '本地多选上传'}</span>
                    <span className="text-xs text-gray-400 mt-1">支持拖拽或点击</span>
                  </label>
                </div>

                {images.length > 0 && (
                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">队列清单 ({images.length})</span>
                      <button 
                        onClick={() => updateAttributes({ images: [] })}
                        className="text-xs text-red-500 hover:underline"
                      >
                        清空全部
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 max-h-[160px] overflow-y-auto p-1 pr-2">
                      {images.map((url: string, index: number) => (
                        <div key={index} className="relative aspect-square group/item rounded-lg overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                          <img src={formatUrl(url)} alt="" className="w-full h-full object-cover !m-0" />
                          <button
                            onClick={() => removeImage(index)}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity"
                          >
                            <Trash2 size={16} className="text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </NodeViewWrapper>
  );
};

