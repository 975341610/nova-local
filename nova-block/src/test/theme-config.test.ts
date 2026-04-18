import { describe, it, expect } from 'vitest';
import { validateThemeConfig, DEFAULT_THEME_CONFIG } from '../lib/themeUtils';

describe('Theme Configuration Validation', () => {
  it('should validate a correct config', () => {
    expect(validateThemeConfig(DEFAULT_THEME_CONFIG)).toBe(true);
  });

  it('should validate backward compatible 1.0 config', () => {
    const oldConfig = {
      version: '1.0',
      slashMenu: {
        opacity: 0.8,
        blur: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
      },
      textMenu: {
        opacity: 0.9,
        blur: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
      },
      blockMenu: {
        opacity: 0.85,
        blur: 15,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
      },
    };
    expect(validateThemeConfig(oldConfig)).toBe(true);
  });

  it('should reject a config with missing fields in 1.1', () => {
    const invalidConfig = {
      version: '1.1',
      slashMenu: {
        opacity: 0.8,
        blur: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        // missing foregroundColor and borderColor
      }
    };
    expect(validateThemeConfig(invalidConfig)).toBe(false);
  });

  it('should reject a config with missing sections', () => {
    const invalidConfig = {
      version: '1.0',
      slashMenu: {
        opacity: 0.8,
        blur: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
      }
      // textMenu and blockMenu missing
    };
    expect(validateThemeConfig(invalidConfig)).toBe(false);
  });

  it('should reject a config with invalid version', () => {
    const invalidConfig = {
      ...DEFAULT_THEME_CONFIG,
      version: '2.0'
    };
    expect(validateThemeConfig(invalidConfig)).toBe(false);
  });

  it('should reject a config with out of range opacity', () => {
    const invalidConfig = {
      ...DEFAULT_THEME_CONFIG,
      slashMenu: {
        ...DEFAULT_THEME_CONFIG.slashMenu,
        opacity: 1.5
      }
    };
    expect(validateThemeConfig(invalidConfig)).toBe(false);
  });

  it('should reject a config with negative blur', () => {
    const invalidConfig = {
      ...DEFAULT_THEME_CONFIG,
      slashMenu: {
        ...DEFAULT_THEME_CONFIG.slashMenu,
        blur: -10
      }
    };
    expect(validateThemeConfig(invalidConfig)).toBe(false);
  });
});
