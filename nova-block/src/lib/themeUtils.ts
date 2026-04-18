import type { ThemeConfig } from './types';

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  version: '1.1',
  slashMenu: {
    opacity: 0.8,
    blur: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    foregroundColor: 'rgba(55, 53, 47, 1)',
    borderColor: 'rgba(233, 233, 231, 1)',
  },
  textMenu: {
    opacity: 0.9,
    blur: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    foregroundColor: 'rgba(55, 53, 47, 1)',
    borderColor: 'rgba(233, 233, 231, 1)',
  },
  blockMenu: {
    opacity: 0.85,
    blur: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    foregroundColor: 'rgba(55, 53, 47, 1)',
    borderColor: 'rgba(233, 233, 231, 1)',
  },
};

export const THEME_STORAGE_KEY = 'nova_theme_config';

export const validateThemeConfig = (config: any): config is ThemeConfig => {
  if (!config || typeof config !== 'object') return false;
  
  const sections = ['slashMenu', 'textMenu', 'blockMenu'];
  for (const section of sections) {
    const s = config[section];
    if (!s || typeof s !== 'object') return false;
    if (typeof s.opacity !== 'number' || s.opacity < 0 || s.opacity > 1) return false;
    if (typeof s.blur !== 'number' || s.blur < 0) return false;
    if (typeof s.backgroundColor !== 'string') return false;
    // For 1.1+, check additional fields if they exist
    if (config.version === '1.1') {
      if (typeof s.foregroundColor !== 'string') return false;
      if (typeof s.borderColor !== 'string') return false;
    } else if (config.version !== '1.0') {
      // Reject unknown versions
      return false;
    }
  }

  return true;
};

export const getThemeConfig = (): ThemeConfig => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Migration and backward compatibility
      const merged = {
        ...DEFAULT_THEME_CONFIG,
        ...parsed,
        slashMenu: { ...DEFAULT_THEME_CONFIG.slashMenu, ...(parsed.slashMenu || {}) },
        textMenu: { ...DEFAULT_THEME_CONFIG.textMenu, ...(parsed.textMenu || {}) },
        blockMenu: { ...DEFAULT_THEME_CONFIG.blockMenu, ...(parsed.blockMenu || {}) },
        version: '1.1' // Always upgrade to latest version internally
      };
      
      if (validateThemeConfig(merged)) {
        return merged;
      }
    } catch (e) {
      console.error('Failed to parse theme config', e);
    }
  }
  return DEFAULT_THEME_CONFIG;
};

export const saveThemeConfig = (config: ThemeConfig) => {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(config));
  applyThemeConfig(config);
};

export const applyThemeConfig = (config: ThemeConfig) => {
  const root = document.documentElement;
  
  // Slash Menu
  root.style.setProperty('--slash-menu-opacity', config.slashMenu.opacity.toString());
  root.style.setProperty('--slash-menu-blur', `${config.slashMenu.blur}px`);
  root.style.setProperty('--slash-menu-bg', config.slashMenu.backgroundColor);
  root.style.setProperty('--slash-menu-fg', config.slashMenu.foregroundColor);
  root.style.setProperty('--slash-menu-border', config.slashMenu.borderColor);

  // Text Menu
  root.style.setProperty('--text-menu-opacity', config.textMenu.opacity.toString());
  root.style.setProperty('--text-menu-blur', `${config.textMenu.blur}px`);
  root.style.setProperty('--text-menu-bg', config.textMenu.backgroundColor);
  root.style.setProperty('--text-menu-fg', config.textMenu.foregroundColor);
  root.style.setProperty('--text-menu-border', config.textMenu.borderColor);

  // Block Menu
  root.style.setProperty('--block-menu-opacity', config.blockMenu.opacity.toString());
  root.style.setProperty('--block-menu-blur', `${config.blockMenu.blur}px`);
  root.style.setProperty('--block-menu-bg', config.blockMenu.backgroundColor);
  root.style.setProperty('--block-menu-fg', config.blockMenu.foregroundColor);
  root.style.setProperty('--block-menu-border', config.blockMenu.borderColor);
};

export const exportThemeConfig = (config: ThemeConfig) => {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nova-theme-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
