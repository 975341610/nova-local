/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { BackgroundPaper } from '../../components/editor/BackgroundPaper';
import { describe, it, expect } from 'vitest';

describe('BackgroundPaper Component', () => {
  it('renders nothing when type is none', () => {
    const { container } = render(<BackgroundPaper type="none" />);
    expect(container.firstChild).toBeNull();
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
