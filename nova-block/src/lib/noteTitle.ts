type TitleBlockLike = {
  isTextblock?: boolean;
  type?: { name?: string };
  textContent?: string;
};

type TitleDocLike = {
  firstChild?: TitleBlockLike | null;
};

const TITLE_SOURCE_BLOCKS = new Set(['heading', 'paragraph']);

export function extractLeadingNoteTitle(doc: TitleDocLike | null | undefined) {
  const firstBlock = doc?.firstChild;
  if (!firstBlock?.isTextblock) {
    return null;
  }

  if (!TITLE_SOURCE_BLOCKS.has(firstBlock.type?.name || '')) {
    return null;
  }

  const title = (firstBlock.textContent || '').trim();
  return title || null;
}
