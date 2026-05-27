import React, { useCallback, useEffect, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'

interface OutlineItem {
  id: string
  key?: string
  text: string
  level: number
}

interface TableOfContentsProps {
  outline: OutlineItem[]
  activeId?: string
  scrollContainerRef?: React.RefObject<HTMLDivElement>
  isCollapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  outline,
  activeId: propActiveId,
  scrollContainerRef,
  isCollapsed: controlledCollapsed,
  onCollapsedChange,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const [activeId, setActiveId] = useState<string | undefined>(propActiveId)
  const isCollapsed = controlledCollapsed ?? internalCollapsed
  const resolveActiveHeading = useCallback(() => {
    const stableOutline = outline.filter((item) => !item.id.startsWith('h-pending-'))
    if (!stableOutline.length) return undefined

    const containerElement = scrollContainerRef?.current
    const rootTop = containerElement?.getBoundingClientRect().top ?? 0
    const activationTop = rootTop + 112
    let nextActiveId: string | undefined

    for (const item of stableOutline) {
      const element = document.getElementById(item.id)
      if (!element) continue
      const top = element.getBoundingClientRect().top
      if (top <= activationTop) {
        nextActiveId = item.id
        continue
      }
      break
    }

    return nextActiveId || stableOutline[0].id
  }, [outline, scrollContainerRef])

  const toggleCollapsed = useCallback(() => {
    const next = !isCollapsed
    if (onCollapsedChange) onCollapsedChange(next)
    else setInternalCollapsed(next)
  }, [isCollapsed, onCollapsedChange])

  useEffect(() => {
    if (propActiveId) {
      setActiveId(propActiveId)
    }
  }, [propActiveId])

  useEffect(() => {
    if (propActiveId) return

    const syncActiveHeading = () => {
      setActiveId(resolveActiveHeading())
    }
    const raf = window.requestAnimationFrame(syncActiveHeading)
    const container = scrollContainerRef?.current || window
    container.addEventListener('scroll', syncActiveHeading, { passive: true })
    window.addEventListener('resize', syncActiveHeading)

    return () => {
      window.cancelAnimationFrame(raf)
      container.removeEventListener('scroll', syncActiveHeading)
      window.removeEventListener('resize', syncActiveHeading)
    }
  }, [propActiveId, resolveActiveHeading, scrollContainerRef])

  const handleClick = useCallback((id: string) => {
    const element = document.getElementById(id)
    const container = scrollContainerRef?.current || window
    if (!element) return

    const headerOffset = 96
    if (container === window) {
      const elementPosition = element.getBoundingClientRect().top
      window.scrollTo({
        top: elementPosition + window.scrollY - headerOffset,
        behavior: 'smooth',
      })
      return
    }

    const containerElement = container as HTMLDivElement
    const elementRect = element.getBoundingClientRect()
    const containerRect = containerElement.getBoundingClientRect()
    const relativeTop = elementRect.top - containerRect.top
    containerElement.scrollTo({
      top: containerElement.scrollTop + relativeTop - headerOffset,
      behavior: 'smooth',
    })
  }, [scrollContainerRef])

  useEffect(() => {
    if (!outline.length || typeof IntersectionObserver === 'undefined') return

    const stableOutline = outline.filter((item) => !item.id.startsWith('h-pending-'))
    if (!stableOutline.length) return

    const visibleHeadings = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleHeadings.set(entry.target.id, entry.intersectionRatio)
          else visibleHeadings.delete(entry.target.id)
        })

        for (const item of stableOutline) {
          if (visibleHeadings.has(item.id)) {
            setActiveId(item.id)
            break
          }
        }
      },
      {
        root: scrollContainerRef?.current || null,
        rootMargin: '-96px 0px -70% 0px',
        threshold: [0, 0.1, 0.5, 1],
      },
    )

    stableOutline.forEach((item) => {
      const element = document.getElementById(item.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [outline, scrollContainerRef])

  return (
    <aside
      data-testid="qingzhi-right-toc"
      data-collapsed={String(isCollapsed)}
      className={`qz-right-toc qz-right-toc-shell ${isCollapsed ? 'qz-right-toc-collapsed' : ''}`}
      aria-label="Table of contents"
    >
      <div data-testid="qingzhi-right-toc-head" className="qz-right-toc-head">
        {!isCollapsed && (
          <div data-testid="qingzhi-right-toc-title" className="qz-right-toc-title">
            <span>目录</span>
          </div>
        )}
        <button
          type="button"
          data-testid="qingzhi-right-toc-toggle"
          className="qz-right-toc-toggle"
          title={isCollapsed ? '展开目录' : '收起目录'}
          aria-label={isCollapsed ? '展开目录' : '收起目录'}
          onClick={toggleCollapsed}
        >
          {isCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
        </button>
      </div>

      {isCollapsed && (
        <div data-testid="qingzhi-right-toc-collapsed-lines" className="qz-right-toc-collapsed-lines" aria-hidden="true">
          {(outline.length ? outline.slice(0, 8) : [{ id: 'empty', level: 1, text: '' }]).map((item, index) => (
            <span key={item.id || `toc-collapsed-line-${index}`} data-level={item.level} />
          ))}
        </div>
      )}

      {!isCollapsed && (
        <div className="qz-right-toc-body">
          {outline.length === 0 ? (
            <div data-testid="qingzhi-right-toc-empty" className="qz-right-toc-empty">
              当前笔记暂无标题
            </div>
          ) : (
            <nav className="qz-right-toc-list">
              {outline.map((item, index) => {
                const isActive = activeId === item.id
                return (
                  <button
                    key={item.key || item.id || `toc-${index}`}
                    type="button"
                    className="qz-right-toc-item"
                    data-active={String(isActive)}
                    data-level={item.level}
                    onClick={() => handleClick(item.id)}
                  >
                    <span className="qz-right-toc-item-line" aria-hidden="true" />
                    <span className="qz-right-toc-item-text">
                      {item.text.trim() || 'Untitled'}
                    </span>
                  </button>
                )
              })}
            </nav>
          )}
        </div>
      )}
    </aside>
  )
}
