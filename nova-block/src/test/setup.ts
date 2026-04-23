import '@testing-library/react';
import { createElement } from 'react';
import { vi } from 'vitest';

// Mock window.prompt
window.prompt = vi.fn();

// Mock react-virtuoso to avoid JSDOM compatibility issues
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent, style }: any) =>
    createElement(
      'div',
      { style },
      data.map((item: any, index: number) => itemContent(index, item)),
    ),
}));

// Tiptap needs a real DOM environment
if (typeof window !== 'undefined') {
  // Add any specific browser mocks here if needed
}
