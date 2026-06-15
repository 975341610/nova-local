import { useEffect, useState } from 'react';

export type DocumentViewMode = 'card' | 'preview';

type UseDocumentAttachmentViewStateOptions = {
  cacheKey: string;
  initialViewMode: DocumentViewMode;
  pageCount: number;
  onViewModeChange: (viewMode: DocumentViewMode) => void;
};

export const useDocumentAttachmentViewState = ({
  cacheKey,
  initialViewMode,
  pageCount,
  onViewModeChange,
}: UseDocumentAttachmentViewStateOptions) => {
  const [sessionViewMode, setSessionViewMode] = useState<DocumentViewMode>(initialViewMode);
  const [fullscreen, setFullscreen] = useState(false);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [showPages, setShowPages] = useState(true);

  useEffect(() => {
    setSessionViewMode(initialViewMode);
    setFullscreen(false);
    setPage(1);
    setZoom(100);
    setShowPages(true);
  }, [cacheKey, initialViewMode]);

  useEffect(() => {
    setPage((current) => Math.max(1, Math.min(pageCount, current)));
  }, [pageCount]);

  const setCachedViewMode = (nextViewMode: DocumentViewMode) => {
    setSessionViewMode(nextViewMode);
    onViewModeChange(nextViewMode);
  };

  const setNextPage = (next: number) => {
    setPage(Math.max(1, Math.min(pageCount, next)));
  };

  const zoomOut = () => setZoom((current) => Math.max(50, current - 10));
  const zoomIn = () => setZoom((current) => Math.min(200, current + 10));

  return {
    sessionViewMode,
    setCachedViewMode,
    fullscreen,
    setFullscreen,
    page,
    setNextPage,
    zoom,
    setZoom,
    zoomOut,
    zoomIn,
    showPages,
    setShowPages,
  };
};
