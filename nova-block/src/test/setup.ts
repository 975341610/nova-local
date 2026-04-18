import '@testing-library/react';
import { vi } from 'vitest';

// Mock window.prompt
window.prompt = vi.fn();

// Tiptap needs a real DOM environment
if (typeof window !== 'undefined') {
  // Add any specific browser mocks here if needed
}
