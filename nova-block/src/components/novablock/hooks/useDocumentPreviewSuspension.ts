import { useEffect } from 'react';

const DOCUMENT_PREVIEW_SUSPENDED_FLAG = 'qzDocumentPreviewSuspended';
const DOCUMENT_PREVIEW_SUSPEND_EVENT = 'qz:document-preview-suspend';
const DOCUMENT_PREVIEW_RESUME_EVENT = 'qz:document-preview-resume';

function resumeDocumentPreviews() {
  if (document.body.dataset[DOCUMENT_PREVIEW_SUSPENDED_FLAG] === 'true') {
    delete document.body.dataset[DOCUMENT_PREVIEW_SUSPENDED_FLAG];
    window.dispatchEvent(new CustomEvent(DOCUMENT_PREVIEW_RESUME_EVENT));
  }
}

function suspendDocumentPreviews() {
  document.body.dataset[DOCUMENT_PREVIEW_SUSPENDED_FLAG] = 'true';
  window.dispatchEvent(new CustomEvent(DOCUMENT_PREVIEW_SUSPEND_EVENT));
}

export function useDocumentPreviewSuspension(shouldSuspend: boolean) {
  useEffect(() => {
    if (!shouldSuspend) {
      resumeDocumentPreviews();
      return;
    }

    suspendDocumentPreviews();
    return resumeDocumentPreviews;
  }, [shouldSuspend]);
}
