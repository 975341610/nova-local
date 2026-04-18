import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OutlineItem {
  id: string;
  key?: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  outline: OutlineItem[];
  activeId?: string;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

/**
 * TableOfContents Component
 * A minimalist TOC that appears as lines on the right side and expands on hover.
 */
export const TableOfContents: React.FC<TableOfContentsProps> = ({ 
  outline, 
  activeId: propActiveId,
  scrollContainerRef 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(propActiveId);

  // Sync scroll position with active heading
  useEffect(() => {
    if (propActiveId) {
      setActiveId(propActiveId);
    }
  }, [propActiveId]);

  // Handle click to scroll
  const handleClick = useCallback((id: string) => {
    const element = document.getElementById(id);
    const container = scrollContainerRef?.current || window;
    
    if (element) {
      // 动态计算 Offset，确保标题在 Header 下方（Header 约 80px，加 20px 缓冲）
      const headerOffset = 100; 
      
      if (container === window) {
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      } else {
        const containerElement = container as HTMLDivElement;
        // 使用相对容器的偏移
        const elementRect = element.getBoundingClientRect();
        const containerRect = containerElement.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top;
        
        containerElement.scrollTo({
          top: containerElement.scrollTop + relativeTop - headerOffset,
          behavior: 'smooth',
        });
      }
    }
  }, [scrollContainerRef]);

  // Use IntersectionObserver to track which heading is currently visible
  useEffect(() => {
    if (!outline.length) return;

    // 过滤掉所有 pending ID，这些 ID 还没渲染到 DOM
    const stableOutline = outline.filter(it => !it.id.startsWith('h-pending-'));
    if (!stableOutline.length) return;

    const visibleHeadings = new Map<string, number>();
    let observer: IntersectionObserver | null = null;

    const initObserver = () => {
      if (observer) observer.disconnect();
      
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              visibleHeadings.set(entry.target.id, entry.intersectionRatio);
            } else {
              visibleHeadings.delete(entry.target.id);
            }
          });

          if (visibleHeadings.size > 0) {
            let bestId = '';
            // 找出在 outline 中位置最靠前的可见标题
            for (const item of stableOutline) {
              if (visibleHeadings.has(item.id)) {
                bestId = item.id;
                break; 
              }
            }
            if (bestId) setActiveId(bestId);
          }
        },
        {
          root: scrollContainerRef?.current || null,
          // rootMargin 顶部留出足够空间，避免 Header 遮挡触发逻辑
          rootMargin: '-100px 0px -70% 0px',
          threshold: [0, 0.1, 0.5, 1.0],
        }
      );

      let observedCount = 0;
      stableOutline.forEach((item) => {
        const element = document.getElementById(item.id);
        if (element && observer) {
          observer.observe(element);
          observedCount++;
        }
      });
      return observedCount;
    };

    // 初始尝试
    const initialObserved = initObserver();
    
    // 如果没有观察到任何元素（可能是 Tiptap 还没渲染完 DOM），启动轮询检查
    let retryCount = 0;
    const maxRetries = 5;
    let intervalId: any = null;

    if (initialObserved < stableOutline.length) {
      intervalId = setInterval(() => {
        const currentObserved = initObserver();
        retryCount++;
        if (currentObserved >= stableOutline.length || retryCount >= maxRetries) {
          clearInterval(intervalId);
        }
      }, 300);
    }

    return () => {
      if (observer) observer.disconnect();
      if (intervalId) clearInterval(intervalId);
    };
  }, [outline, scrollContainerRef]);

  if (!outline || outline.length === 0) return null;

  return (
    <motion.aside
      style={{
        '--toc-line-muted': 'rgba(0, 0, 0, 0.12)',
        '--toc-line-hover': 'rgba(0, 0, 0, 0.4)',
        '--toc-line-active': 'rgb(37, 99, 235)',
        '--toc-text-muted': 'rgb(120, 113, 108)',
        '--toc-text-hover': 'rgb(28, 25, 23)',
        '--toc-text-active': 'rgb(37, 99, 235)',
      } as React.CSSProperties}
      className="fixed right-6 top-1/2 -translate-y-1/2 z-[50] flex flex-col items-end py-6 select-none pointer-events-auto transition-shadow novablock-toc-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={false}
      animate={{
        width: isHovered ? '240px' : '48px',
        backgroundColor: 'transparent',
        backdropFilter: isHovered ? 'blur(12px)' : 'blur(0px)',
        border: 'none',
        boxShadow: 'none',
        borderRadius: '24px',
      }}
      transition={{
        duration: 0.4,
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      <style>{`
        .novablock-toc-container {
          --toc-line-muted: rgba(0, 0, 0, 0.12);
          --toc-line-hover: rgba(0, 0, 0, 0.4);
          --toc-line-active: rgb(37, 99, 235);
          --toc-text-muted: rgb(120, 113, 108);
          --toc-text-hover: rgb(28, 25, 23);
          --toc-text-active: rgb(37, 99, 235);
        }
        @media (prefers-color-scheme: dark) {
          .novablock-toc-container {
            --toc-line-muted: rgba(255, 255, 255, 0.15);
            --toc-line-hover: rgba(255, 255, 255, 0.5);
            --toc-text-muted: rgb(168, 162, 158);
            --toc-text-hover: rgb(245, 245, 244);
          }
        }
      `}</style>
      <nav className="flex flex-col gap-2 items-end w-full px-4 overflow-y-auto custom-scrollbar max-h-[80vh] overflow-x-hidden">
        {outline.map((item, index) => {
          const isActive = activeId === item.id;
          
          return (
            <button
              key={item.key || item.id || `toc-${index}`}
              onClick={() => handleClick(item.id)}
              className="group relative flex items-center justify-end h-8 w-full outline-none transition-all duration-300 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 px-2"
            >
              <div className="flex items-center gap-3 w-full justify-end">
                <AnimatePresence>
                  {isHovered && (
                    <motion.span
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 5 }}
                      className="text-[12px] font-medium tracking-tight whitespace-nowrap transition-colors duration-300 flex-1 text-right truncate drop-shadow-sm"
                      style={{
                        color: isActive ? 'var(--toc-text-active)' : 'var(--toc-text-muted)',
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {item.text.trim() === '' ? '无标题' : item.text}
                    </motion.span>
                  )}
                </AnimatePresence>

                <div
                  className={`h-[2px] rounded-full transition-all duration-300 transform shrink-0 ${
                    item.level === 1 ? "w-6" : item.level === 2 ? "w-4" : "w-2"
                  } ${
                    isActive ? "w-8 shadow-[0_0_8px_rgba(59,130,246,0.4)]" : "opacity-100"
                  }`}
                  style={{
                    backgroundColor: isActive ? 'var(--toc-line-active)' : isHovered ? 'var(--toc-line-hover)' : 'var(--toc-line-muted)',
                  }}
                />
              </div>
            </button>
          );
        })}
      </nav>
    </motion.aside>
  );
};
