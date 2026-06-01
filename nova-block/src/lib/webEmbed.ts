const URL_WITH_PROTOCOL_RE = /^https?:\/\/[^\s<>"']+$/i;
const URL_WITHOUT_PROTOCOL_RE = /^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?$/i;

export function normalizeWebEmbedUrl(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('nova://') || trimmed.startsWith('#nova-block')) return null;
  if (URL_WITH_PROTOCOL_RE.test(trimmed)) return trimmed;
  if (URL_WITHOUT_PROTOCOL_RE.test(trimmed)) return `https://${trimmed}`;
  return null;
}

export function isVideoEmbedUrl(value: string): boolean {
  const normalized = normalizeWebEmbedUrl(value);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    return (
      host === 'bilibili.com' ||
      host === 'b23.tv' ||
      host === 'youtube.com' ||
      host === 'youtu.be' ||
      host === 'vimeo.com' ||
      host === 'douyin.com' ||
      host === 'iesdouyin.com' ||
      host === 'tiktok.com'
    );
  } catch {
    return false;
  }
}

export function isWebPageEmbedUrl(value: string): boolean {
  const normalized = normalizeWebEmbedUrl(value);
  if (!normalized) return false;
  return !isVideoEmbedUrl(normalized);
}

export function defaultWebEmbedTitle(value: string): string {
  const normalized = normalizeWebEmbedUrl(value) || value;
  try {
    const url = new URL(normalized);
    return url.hostname.replace(/^www\./i, '') || normalized;
  } catch {
    return normalized;
  }
}
