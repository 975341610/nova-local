/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { BackgroundPaper } from '../../components/editor/BackgroundPaper';
import { describe, it, expect } from 'vitest';

describe('BackgroundPaper Component', () => {
  it('keeps a stable hidden layer when type is none', () => {
    const { container } = render(<BackgroundPaper type="none" />);
    const div = container.firstChild as HTMLElement;
    expect(div).not.toBeNull();
    expect(div.getAttribute('aria-hidden')).toBe('true');
    expect(div.style.opacity).toBe('0');
    expect(div.style.backgroundImage).toBe('');
  });

  it('reuses the same layer when switching paper type', () => {
    const { container, rerender } = render(<BackgroundPaper type="none" />);
    const initial = container.firstChild as HTMLElement;

    rerender(<BackgroundPaper type="dot" />);

    const updated = container.firstChild as HTMLElement;
    expect(updated).toBe(initial);
    expect(updated.style.opacity).toBe('0.4');
    expect(updated.style.backgroundImage).toContain('radial-gradient');
  });

  it('renders dot pattern', () => {
    const { container } = render(<BackgroundPaper type="dot" />);
    const div = container.firstChild as HTMLElement;
    expect(div).not.toBeNull();
    expect(div.style.backgroundImage).toContain('radial-gradient');
    expect(div.style.backgroundSize).toBe('24px 24px');
  });

  it('renders line pattern', () => {
    const { container } = render(<BackgroundPaper type="line" />);
    const div = container.firstChild as HTMLElement;
    expect(div).not.toBeNull();
    expect(div.style.backgroundImage).toContain('linear-gradient');
    expect(div.style.backgroundSize).toBe('100% 24px');
  });

  it('renders grid pattern', () => {
    const { container } = render(<BackgroundPaper type="grid" />);
    const div = container.firstChild as HTMLElement;
    expect(div).not.toBeNull();
    expect(div.style.backgroundImage).toContain('linear-gradient');
    expect(div.style.backgroundSize).toBe('24px 24px');
  });
});
