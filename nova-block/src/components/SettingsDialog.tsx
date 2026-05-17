import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Cpu, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle, Loader2, Settings, BookOpen, Upload, Database, RefreshCw, Zap, Palette, Download, FileJson, Save, Package, CalendarDays, Command, PanelRight, Share2, MessageSquare, Clock, Plus, GripVertical } from 'lucide-react';
import { api } from '../lib/api';
import { useAI } from '../contexts/AIContext';
import { getThemeConfig, saveThemeConfig, exportThemeConfig, validateThemeConfig, applyThemeConfig } from '../lib/themeUtils';
import type { AIEngineMode, ThemeConfig, VaultHealthReport } from '../lib/types';
import { isSpellcheckFeatureEnabled, saveSpellcheckFeatureEnabled } from '../lib/spellcheckSettings';
import { UpdaterPanel } from './UpdaterPanel';
import {
  QINGZHI_TOPBAR_ACTIONS,
  readQingzhiSettings,
  saveQingzhiSettings,
  type QingzhiSettings,
  type QingzhiTopbarActionId,
} from '../lib/qingzhiSettings';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { isAiEnabled, setIsAiEnabled, aiMode, setAiMode, contextLength, setContextLength, refreshAiStatus } = useAI();
  const [hwStatus, setHwStatus] = useState<{ compatible: boolean; details: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [updatingOllama, setUpdatingOllama] = useState(false);
  const [loadingModelConfig, setLoadingModelConfig] = useState(false);
  const [savingModelConfig, setSavingModelConfig] = useState(false);
  const [modelConfigNotice, setModelConfigNotice] = useState<{ success: boolean; message: string } | null>(null);
  const [modelConfig, setModelConfig] = useState({
    provider: 'openai',
    api_key: '',
    api_key_masked: '',
    base_url: '',
    model_name: '',
  });
  const [activeTab, setActiveTab] = useState<'ai' | 'dictionary' | 'theme' | 'qingzhi' | 'vault' | 'updater'>('ai');
  const [isSpellcheckEnabled, setIsSpellcheckEnabled] = useState(isSpellcheckFeatureEnabled());
  
  // Dictionary Import State
  const [dictText, setDictText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  // Theme State
  const [themeConfig, setThemeConfigState] = useState<ThemeConfig>(getThemeConfig());
  const [qingzhiSettings, setQingzhiSettings] = useState<QingzhiSettings>(() => readQingzhiSettings());
  const [themeImportError, setThemeImportError] = useState<string | null>(null);
  const [themeImportSuccess, setThemeImportSuccess] = useState(false);
  const [vaultHealth, setVaultHealth] = useState<VaultHealthReport | null>(null);
  const [vaultHealthLoading, setVaultHealthLoading] = useState(false);
  const [vaultHealthError, setVaultHealthError] = useState<string | null>(null);

  // v0.22.0 · 全量导出
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // v0.22.0 · 快照策略(去抖秒数 / 最大保留条数)
  const [revDebounce, setRevDebounce] = useState<number>(120);
  const [revMaxKeep, setRevMaxKeep] = useState<number>(30);
  const [revLoading, setRevLoading] = useState(false);
  const [revSaving, setRevSaving] = useState(false);
  const [revNotice, setRevNotice] = useState<{ success: boolean; message: string } | null>(null);

  const loadRevisionSettings = async () => {
    setRevLoading(true);
    try {
      const cfg = await api.getRevisionSettings();
      setRevDebounce(cfg.debounce_seconds);
      setRevMaxKeep(cfg.max_keep);
    } catch (err: any) {
      console.warn('load revision settings failed', err);
    } finally {
      setRevLoading(false);
    }
  };

  const saveRevisionSettings = async () => {
    setRevSaving(true);
    setRevNotice(null);
    try {
      const cfg = await api.updateRevisionSettings({
        debounce_seconds: revDebounce,
        max_keep: revMaxKeep,
      });
      setRevDebounce(cfg.debounce_seconds);
      setRevMaxKeep(cfg.max_keep);
      setRevNotice({ success: true, message: `已保存 · 去抖 ${cfg.debounce_seconds}s · 保留 ${cfg.max_keep}+1 条` });
    } catch (err: any) {
      setRevNotice({ success: false, message: err?.message || '保存失败' });
    } finally {
      setRevSaving(false);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      // 采集 LocalStorage 里与 Nova 相关的键(nova_ 前缀)
      const snapshot: Record<string, unknown> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (!key.startsWith('nova') && !key.startsWith('nv-') && !key.startsWith('whiteboard')) continue;
          const raw = localStorage.getItem(key);
          if (raw == null) continue;
          try {
            snapshot[key] = JSON.parse(raw);
          } catch {
            snapshot[key] = raw;
          }
        }
      } catch (err) {
        console.warn('[export-all] dump localStorage failed', err);
      }

      const blob = await api.exportAllData(snapshot);
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nova-export-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
      setExportSuccess(`已生成备份包 · ${sizeMb} MB`);
    } catch (err: any) {
      console.error('export-all failed', err);
      setExportError(err?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshAiStatus();
      loadModelConfig();
      setImportResult(null);
      setThemeConfigState(getThemeConfig());
      setQingzhiSettings(readQingzhiSettings());
      setThemeImportError(null);
      setThemeImportSuccess(false);
      setModelConfigNotice(null);
      setIsSpellcheckEnabled(isSpellcheckFeatureEnabled());
      void loadVaultHealth();
      void loadRevisionSettings();
    }
  }, [isOpen, refreshAiStatus]);

  const loadVaultHealth = async () => {
    setVaultHealthLoading(true);
    setVaultHealthError(null);
    try {
      setVaultHealth(await api.getVaultHealth());
    } catch (err: any) {
      console.error('Failed to load vault health:', err);
      setVaultHealthError(err?.message || 'Vault 体检失败');
    } finally {
      setVaultHealthLoading(false);
    }
  };

  const loadModelConfig = async () => {
    setLoadingModelConfig(true);
    try {
      const next = await api.getModelConfig();
      setModelConfig({
        provider: next.provider || 'openai',
        api_key: '',
        api_key_masked: next.api_key_masked || '',
        base_url: next.base_url || '',
        model_name: next.model_name || '',
      });
    } catch (err) {
      console.error('Failed to load AI model config:', err);
      setModelConfigNotice({ success: false, message: '加载 AI 配置失败' });
    } finally {
      setLoadingModelConfig(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await api.updateAIPluginConfig({ enabled: !isAiEnabled });
      setIsAiEnabled(res.enabled);
      setAiMode(res.ai_mode === 'local' ? 'local' : 'remote');
    } catch (err) {
      console.error('Failed to toggle AI plugin:', err);
    } finally {
      setToggling(false);
    }
  };

  const handleAiModeChange = async (nextMode: AIEngineMode) => {
    setToggling(true);
    try {
      const res = await api.updateAIPluginConfig({ enabled: true, ai_mode: nextMode });
      setIsAiEnabled(res.enabled);
      setAiMode(res.ai_mode === 'local' ? 'local' : 'remote');
    } catch (err) {
      console.error('Failed to switch AI mode:', err);
    } finally {
      setToggling(false);
    }
  };

  const handleContextLengthChange = async (val: number) => {
    setContextLength(val);
    try {
      await api.updateAIPluginConfig({ num_ctx: val });
    } catch (err) {
      console.error('Failed to update context length:', err);
    }
  };

  const handleUpdateOllama = async () => {
    setUpdatingOllama(true);
    try {
      const res = await api.updateOllama();
      if (res.status === 'success') {
        alert('Ollama 更新成功！');
      } else {
        alert('Ollama 更新失败: ' + (res.message || res.output));
      }
    } catch (err) {
      console.error('Failed to update Ollama:', err);
      alert('Ollama 更新请求失败');
    } finally {
      setUpdatingOllama(false);
    }
  };

  const handleSaveModelConfig = async () => {
    setSavingModelConfig(true);
    setModelConfigNotice(null);
    try {
      const { api_key_masked: _apiKeyMasked, ...payload } = modelConfig;
      const saved = await api.updateModelConfig(payload);
      setModelConfig({
        provider: saved.provider || 'openai',
        api_key: '',
        api_key_masked: saved.api_key_masked || '',
        base_url: saved.base_url || '',
        model_name: saved.model_name || '',
      });
      setModelConfigNotice({ success: true, message: 'AI 配置已保存' });
    } catch (err: any) {
      console.error('Failed to save AI model config:', err);
      setModelConfigNotice({ success: false, message: err.message || '保存 AI 配置失败' });
    } finally {
      setSavingModelConfig(false);
    }
  };

  const handleImportDict = async () => {
    if (!dictText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.importDictionary(dictText);
      setImportResult({ success: true, message: res.message });
      setDictText('');
    } catch (err: any) {
      console.error('Failed to import dictionary:', err);
      setImportResult({ success: false, message: err.message || '导入失败，请检查格式' });
    } finally {
      setImporting(false);
    }
  };

  const handleToggleSpellcheck = () => {
    const next = !isSpellcheckEnabled;
    setIsSpellcheckEnabled(next);
    saveSpellcheckFeatureEnabled(next);
  };

  const checkHardware = async () => {
    setChecking(true);
    try {
      const res = await api.checkAIHardware();
      setHwStatus(res);
    } catch (err) {
      console.error('Failed to check hardware:', err);
      setHwStatus({ compatible: false, details: '检查失败，请确保后端服务正常运行' });
    } finally {
      setChecking(false);
    }
  };

  const handleExportTheme = () => {
    exportThemeConfig(themeConfig);
  };

  const handleImportTheme = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const merged = {
          ...getThemeConfig(),
          ...parsed,
          slashMenu: { ...getThemeConfig().slashMenu, ...(parsed.slashMenu || {}) },
          textMenu: { ...getThemeConfig().textMenu, ...(parsed.textMenu || {}) },
          blockMenu: { ...getThemeConfig().blockMenu, ...(parsed.blockMenu || {}) },
          version: '1.1'
        };
        
        if (validateThemeConfig(merged)) {
          saveThemeConfig(merged);
          setThemeConfigState(merged);
          setThemeImportSuccess(true);
          setThemeImportError(null);
          applyThemeConfig(merged);
        } else {
          setThemeImportError('无效的主题配置文件格式');
          setThemeImportSuccess(false);
        }
      } catch {
        setThemeImportError('解析 JSON 失败');
        setThemeImportSuccess(false);
      }
    };
    reader.readAsText(file);
  };

  const updateConfig = (section: keyof ThemeConfig, field: string, value: any) => {
    if (section === 'version') return;
    const newConfig = {
      ...themeConfig,
      [section]: {
        ...themeConfig[section],
        [field]: value
      }
    };
    setThemeConfigState(newConfig);
    saveThemeConfig(newConfig);
  };

  const updateQingzhiSettings = (patch: Partial<QingzhiSettings>) => {
    setQingzhiSettings((prev) => saveQingzhiSettings({ ...prev, ...patch }));
  };

  const readImageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });

  const handleQingzhiAssetPick = async (
    key: 'brandLogoSrc' | 'avatarSrc' | 'mascotSrc',
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const src = await readImageAsDataUrl(file);
      updateQingzhiSettings({ [key]: src } as Partial<QingzhiSettings>);
    } catch (error) {
      console.error('[qingzhi] asset read failed', error);
    } finally {
      event.target.value = '';
    }
  };

  const resetQingzhiAsset = (key: 'brandLogoSrc' | 'avatarSrc' | 'mascotSrc') => {
    updateQingzhiSettings({ [key]: '' } as Partial<QingzhiSettings>);
  };

  const toggleQingzhiTopbarPin = (id: QingzhiTopbarActionId) => {
    const selected = qingzhiSettings.topbarPins.includes(id);
    const nextPins = selected
      ? qingzhiSettings.topbarPins.filter((pin) => pin !== id)
      : [...qingzhiSettings.topbarPins, id].slice(0, 4);
    updateQingzhiSettings({ topbarPins: nextPins });
  };

  const qingzhiSettingsIconMap: Record<QingzhiTopbarActionId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
    daily: CalendarDays,
    command: Command,
    reader: BookOpen,
    inspect: PanelRight,
    graph: Share2,
    ask: MessageSquare,
    export: Download,
    timeline: Clock,
  };

  const renderQingzhiSettingsLegacy = () => (
    <div className="qz-settings-panel space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="qz-settings-hero flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--nv-color-border)] bg-[var(--nv-color-surface-2)] text-sm font-bold text-[var(--nv-color-accent-fg)] shadow-[var(--nv-shadow-rest)]">
            知
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-[0.12em]">清知外观与顶栏</h3>
            <p className="text-[10px] text-muted-foreground">按原预览管理常驻入口、角色水印和顶栏密度</p>
          </div>
        </div>
        <div className="qz-settings-preview-mascot" aria-hidden="true" />
      </div>

      <section data-testid="qingzhi-pinned-zone" className="qz-pinned-zone qz-settings-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-primary">顶栏常驻按钮自定义</h4>
            <p className="text-[10px] text-muted-foreground mt-1">勾选后会立即出现在清知顶栏右侧，顺序按预览功能池排列。</p>
          </div>
          <span className="rounded-full border border-[rgba(200,168,115,.20)] bg-[rgba(250,247,241,.50)] px-2.5 py-1 text-[10px] text-muted-foreground">{qingzhiSettings.topbarPins.length} 个已固定</span>
        </div>

        <div className="qz-settings-pin-grid grid grid-cols-2 gap-2" data-testid="qingzhi-pinned-pool">
          {QINGZHI_TOPBAR_ACTIONS.map((action) => {
            const selected = qingzhiSettings.topbarPins.includes(action.id);
            const Icon = qingzhiSettingsIconMap[action.id];
            return (
              <button
                key={action.id}
                type="button"
                data-testid={`qingzhi-pin-toggle-${action.id}`}
                data-qz-pin={action.id}
                aria-pressed={selected}
                onClick={() => toggleQingzhiTopbarPin(action.id)}
                className={`qz-settings-pin-option rounded-xl border px-3 py-2 text-left transition-all ${
                  selected
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/30 bg-accent/10 text-muted-foreground hover:text-foreground hover:bg-accent/20'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="qz-settings-pin-option-icon" aria-hidden="true">
                    <Icon size={13} strokeWidth={2.1} />
                  </span>
                  <span className="text-xs font-bold">{action.label}</span>
                </span>
                <span className="block text-[10px] opacity-75 mt-1 pl-6">{action.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="qz-settings-range-card space-y-3">
        <div className="flex justify-between text-[10px] font-medium">
          <span className="text-muted-foreground">清知角色水印透明度</span>
          <span className="text-primary">{qingzhiSettings.mascotOpacity.toFixed(2)}</span>
        </div>
        <input
          data-testid="qingzhi-mascot-opacity"
          data-range="mascot-opacity"
          type="range"
          min="0"
          max="0.35"
          step="0.01"
          value={qingzhiSettings.mascotOpacity}
          onChange={(e) => updateQingzhiSettings({ mascotOpacity: parseFloat(e.target.value) })}
          className="qz-settings-range w-full h-1.5 bg-accent/30 rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          透明度会写入 CSS 变量 <code>--qz-mascot-opacity</code>，侧栏清知立绘与后续空状态画屏共享该设置。
        </p>
      </section>
    </div>
  );

  void renderQingzhiSettingsLegacy;

  const renderQingzhiSettings = () => {
    const selectedActions = qingzhiSettings.topbarPins
      .map((id) => QINGZHI_TOPBAR_ACTIONS.find((action) => action.id === id))
      .filter((action): action is (typeof QINGZHI_TOPBAR_ACTIONS)[number] => Boolean(action));
    const candidateActions = QINGZHI_TOPBAR_ACTIONS.filter((action) => !qingzhiSettings.topbarPins.includes(action.id));
    const isFull = selectedActions.length >= 4;

    return (
      <div className="qz-settings-panel animate-in fade-in slide-in-from-bottom-2 duration-300">
        <header className="qz-settings-page-header">
          <div className="flex items-center gap-3">
            <div className="qz-settings-page-stamp">肆</div>
            <h3>Settings · 顶栏常驻按钮自定义</h3>
          </div>
          <span>设置 → 外观 → 顶栏 · 默认 4 项</span>
        </header>

        <section data-testid="qingzhi-pinned-zone" className="qz-settings-card">
          <div className="qz-settings-card-head">
            <div>
              <h4>顶栏常驻按钮</h4>
              <p>最多 4 个，从左到右显示在头像左侧。其余功能可从 … 菜单访问。</p>
            </div>
            <button type="button" onClick={() => updateQingzhiSettings({ topbarPins: ['daily', 'command', 'reader', 'inspect'] })}>
              恢复默认
            </button>
          </div>

          <div data-testid="qingzhi-selected-pins" className="qz-settings-selected-zone">
            <div className="qz-settings-zone-title">已选 · 拖拽排序</div>
            <div className="qz-settings-selected-grid">
              {selectedActions.map((action) => {
                const Icon = qingzhiSettingsIconMap[action.id];
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-testid={`qingzhi-pin-toggle-${action.id}`}
                    data-qz-pin={action.id}
                    aria-pressed="true"
                    onClick={() => toggleQingzhiTopbarPin(action.id)}
                    className="qz-settings-selected-chip"
                    title={`从顶栏移除：${action.label}`}
                  >
                    <GripVertical size={12} aria-hidden="true" />
                    <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
                    <span>{action.label}</span>
                    <X size={14} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="qz-settings-used-count">已用 {selectedActions.length} / 4</div>
          </div>

          <div data-testid="qingzhi-candidate-pool" className="qz-settings-candidate-zone">
            <div className="qz-settings-zone-title">候选库 · 点击 + 加入顶栏</div>
            <div className="qz-settings-candidate-grid">
              {candidateActions.map((action) => {
                const Icon = qingzhiSettingsIconMap[action.id];
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-testid={`qingzhi-pin-toggle-${action.id}`}
                    data-qz-pin={action.id}
                    aria-pressed="false"
                    disabled={isFull}
                    onClick={() => toggleQingzhiTopbarPin(action.id)}
                    className="qz-settings-candidate-chip"
                    title={isFull ? '顶栏最多放 4 个常驻按钮' : `加入顶栏：${action.label}`}
                  >
                    <Icon size={14} strokeWidth={2.1} aria-hidden="true" />
                    <span>{action.label}</span>
                    <Plus size={14} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="qz-settings-candidate-zone">
            <div className="qz-settings-zone-title">清知品牌素材</div>
            <div className="qz-settings-candidate-grid">
              {([
                { key: 'brandLogoSrc', label: '品牌 Logo', value: qingzhiSettings.brandLogoSrc },
                { key: 'avatarSrc', label: '顶栏头像', value: qingzhiSettings.avatarSrc },
                { key: 'mascotSrc', label: '侧栏立绘', value: qingzhiSettings.mascotSrc },
              ] as const).map((asset) => (
                <div key={asset.key} className="qz-settings-asset-card">
                  <div className="qz-settings-asset-meta">
                    <span>{asset.label}</span>
                    <span>{asset.value ? '已替换' : '默认'}</span>
                  </div>
                  <div className="qz-settings-asset-actions">
                    <label className="qz-settings-asset-btn">
                      <Upload size={14} />
                      <span>上传</span>
                      <input hidden type="file" accept="image/*" onChange={(event) => handleQingzhiAssetPick(asset.key, event)} />
                    </label>
                    <button type="button" className="qz-settings-asset-btn" onClick={() => resetQingzhiAsset(asset.key)}>
                      <RefreshCw size={14} />
                      <span>恢复</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="qz-settings-range-card">
            <div>
              <h4>立绘水印不透明度</h4>
              <p>侧边栏底部立绘的可见度（默认 15%）</p>
            </div>
            <input
              data-testid="qingzhi-mascot-opacity"
              data-range="mascot-opacity"
              type="range"
              min="0"
              max="0.35"
              step="0.01"
              value={qingzhiSettings.mascotOpacity}
              onChange={(e) => updateQingzhiSettings({ mascotOpacity: parseFloat(e.target.value) })}
              className="qz-settings-range"
            />
            <span>{Math.round(qingzhiSettings.mascotOpacity * 100)}%</span>
          </div>
        </section>
      </div>
    );
  };

  const renderThemeControl = (label: string, section: 'slashMenu' | 'textMenu' | 'blockMenu') => (
    <div className="p-4 bg-accent/10 rounded-2xl border border-border/20 space-y-4">
      <h4 className="text-xs font-bold text-primary">{label}</h4>
      
      {/* Opacity & Blur */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-medium">
            <span className="text-muted-foreground">透明度</span>
            <span className="text-primary">{themeConfig[section].opacity}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={themeConfig[section].opacity}
            onChange={(e) => updateConfig(section, 'opacity', parseFloat(e.target.value))}
            className="w-full h-1 bg-accent/30 rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-medium">
            <span className="text-muted-foreground">模糊 (px)</span>
            <span className="text-primary">{themeConfig[section].blur}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="40"
            step="1"
            value={themeConfig[section].blur}
            onChange={(e) => updateConfig(section, 'blur', parseInt(e.target.value))}
            className="w-full h-1 bg-accent/30 rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-3">
        {[
          { key: 'backgroundColor', label: '背景颜色' },
          { key: 'foregroundColor', label: '前景颜色' },
          { key: 'borderColor', label: '边框颜色' }
        ].map(({ key, label }) => {
          const colorValue = themeConfig[section][key as 'backgroundColor' | 'foregroundColor' | 'borderColor'];
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                <input
                  type="text"
                  value={colorValue}
                  onChange={(e) => updateConfig(section, key, e.target.value)}
                  className="flex-1 bg-accent/20 border border-border/30 rounded-md px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <div className="relative w-6 h-6 rounded-md border border-border/50 overflow-hidden shrink-0">
                  <input
                    type="color"
                    value={colorValue.startsWith('rgba') ? '#ffffff' : colorValue}
                    onChange={(e) => updateConfig(section, key, e.target.value)}
                    className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/40 backdrop-blur-sm"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-xl bg-background/80 backdrop-blur-2xl border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">设置与空间管理</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 p-1 mx-6 mt-4 bg-accent/20 rounded-xl border border-border/10">
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'ai' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Cpu size={14} />
                AI 设置
              </button>
              <button
                onClick={() => setActiveTab('dictionary')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'dictionary' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BookOpen size={14} />
                词库管理
              </button>
              <button
                onClick={() => setActiveTab('theme')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'theme' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Palette size={14} />
                主题管理
              </button>
              <button
                onClick={() => setActiveTab('qingzhi')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'qingzhi' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Palette size={14} />
                清知
              </button>
              <button
                onClick={() => setActiveTab('vault')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'vault' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Database size={14} />
                Vault 体检
              </button>
              <button
                onClick={() => setActiveTab('updater')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'updater' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Package size={14} />
                更新
              </button>
            </div>

            <div className="p-6 h-[400px] overflow-y-auto custom-scrollbar">
              {activeTab === 'ai' ? (
                <div className="space-y-6">
                  {/* AI Plugin Toggle */}
                  <div className="flex items-center justify-between p-4 bg-accent/20 rounded-2xl border border-border/20">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Cpu className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">AI 功能</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">默认使用远程 AI；需要隐私优先或离线处理时可切换本地 AI。</p>
                      </div>
                    </div>
                    <button
                      data-testid="ai-enabled-toggle"
                      onClick={handleToggle}
                      disabled={toggling}
                      className="p-1 hover:scale-110 transition-transform disabled:opacity-50 relative"
                    >
                      {toggling ? (
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      ) : isAiEnabled ? (
                        <ToggleRight className="w-8 h-8 text-primary" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  <div className="p-4 bg-accent/10 rounded-2xl border border-border/20 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold">AI 引擎模式</h3>
                      <p className="text-[10px] text-muted-foreground mt-1">远程 AI 为默认模式；本地 AI 只在显式选择后启动，避免两套引擎互相抢占。</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        data-testid="ai-mode-remote"
                        onClick={() => handleAiModeChange('remote')}
                        disabled={toggling}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${aiMode === 'remote' ? 'bg-primary text-primary-foreground border-primary' : 'bg-accent/20 border-border/30 text-muted-foreground'}`}
                      >
                        远程 AI（默认）
                      </button>
                      <button
                        data-testid="ai-mode-local"
                        onClick={() => handleAiModeChange('local')}
                        disabled={toggling}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${aiMode === 'local' ? 'bg-primary text-primary-foreground border-primary' : 'bg-accent/20 border-border/30 text-muted-foreground'}`}
                      >
                        本地 AI
                      </button>
                    </div>
                  </div>

                  {toggling && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-center text-primary/60 font-medium bg-primary/5 py-2 rounded-xl border border-primary/10"
                    >
                      {aiMode === 'local' ? "正在处理本地 AI 服务状态..." : "正在保存 AI 设置..."}
                    </motion.div>
                  )}

                  <div className="p-4 bg-accent/10 rounded-2xl border border-border/20 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold">远程 AI 配置</h3>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          没有内置本地模型时，也可以直接接入 OpenAI 兼容接口，编辑器里的加载动画和流式输出会继续保留。
                        </p>
                      </div>
                      {loadingModelConfig && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Provider</label>
                        <input
                          data-testid="ai-model-provider"
                          type="text"
                          value={modelConfig.provider}
                          onChange={(e) => setModelConfig((prev) => ({ ...prev, provider: e.target.value }))}
                          className="w-full bg-accent/20 border border-border/30 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">API Key</label>
                        <input
                          data-testid="ai-model-api-key"
                          type="password"
                          value={modelConfig.api_key}
                          placeholder={modelConfig.api_key_masked || ''}
                          onChange={(e) => setModelConfig((prev) => ({ ...prev, api_key: e.target.value }))}
                          className="w-full bg-accent/20 border border-border/30 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Base URL</label>
                        <input
                          data-testid="ai-model-base-url"
                          type="text"
                          value={modelConfig.base_url}
                          onChange={(e) => setModelConfig((prev) => ({ ...prev, base_url: e.target.value }))}
                          className="w-full bg-accent/20 border border-border/30 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model</label>
                        <input
                          data-testid="ai-model-name"
                          type="text"
                          value={modelConfig.model_name}
                          onChange={(e) => setModelConfig((prev) => ({ ...prev, model_name: e.target.value }))}
                          className="w-full bg-accent/20 border border-border/30 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        建议填写 OpenAI 兼容的 Base URL。选择“远程 AI”后，编辑器中的 AI 写作会直接走这里的配置。
                      </p>
                      <button
                        data-testid="ai-model-save"
                        onClick={handleSaveModelConfig}
                        disabled={savingModelConfig}
                        className="shrink-0 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                      >
                        {savingModelConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        保存配置
                      </button>
                    </div>

                    {modelConfigNotice && (
                      <div
                        className={`p-3 rounded-xl border text-xs font-medium ${
                          modelConfigNotice.success
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-600'
                        }`}
                      >
                        {modelConfigNotice.message}
                      </div>
                    )}
                  </div>

                  {/* Context Length Slider */}
                  <div className="p-4 bg-accent/10 rounded-2xl border border-border/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-bold">上下文长度 (Context Length)</h3>
                      </div>
                      <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                        {contextLength} tokens
                      </span>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="2048"
                        max="32768"
                        step="1024"
                        value={contextLength}
                        onChange={(e) => handleContextLengthChange(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-accent/30 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground font-medium px-1">
                        <span>2048</span>
                        <span>8192</span>
                        <span>16384</span>
                        <span>32768</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      更大的上下文长度允许 AI 处理更长的笔记和更多的引用背景，但会占用更多显存。建议 8GB 显存用户设为 8192 或以上。
                    </p>
                  </div>

                  {/* Hardware Check */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold">硬件兼容性</h3>
                      <button
                        onClick={checkHardware}
                        disabled={checking}
                        className="text-xs font-medium text-primary hover:underline flex items-center gap-1.5"
                      >
                        {checking ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            检查中...
                          </>
                        ) : (
                          '检查硬件兼容性'
                        )}
                      </button>
                    </div>

                    {hwStatus && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-2xl border ${
                          hwStatus.compatible
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {hwStatus.compatible ? (
                            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className="text-sm font-bold">
                              {hwStatus.compatible ? '硬件已就绪' : '发现潜在限制'}
                            </p>
                            <p className="text-xs mt-1 leading-relaxed opacity-90">{hwStatus.details}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'dictionary' ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between p-4 bg-accent/20 rounded-2xl border border-border/20">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">错别字检查</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          关闭后会立即隐藏红线并停止后台检查，编辑器输入不再受影响。
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleSpellcheck}
                      className="p-1 hover:scale-110 transition-transform"
                      aria-label={isSpellcheckEnabled ? '关闭错别字检查' : '开启错别字检查'}
                    >
                      {isSpellcheckEnabled ? (
                        <ToggleRight className="w-8 h-8 text-primary" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Database className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">规则导入与热更新</h3>
                      <p className="text-[10px] text-muted-foreground">支持 TXT 粘贴或多行 CSV 格式</p>
                    </div>
                  </div>

                  <div className="relative group">
                    <textarea
                      value={dictText}
                      onChange={(e) => setDictText(e.target.value)}
                      placeholder={`请输入拼写检查规则，例如：\n("发贴", "发帖", "现代词汇"),\n错误词, 正确词, 分类理由`}
                      className="w-full h-48 p-4 bg-accent/10 border border-border/30 rounded-2xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none custom-scrollbar group-hover:bg-accent/20"
                    />
                    <div className="absolute bottom-3 right-3 opacity-30 group-hover:opacity-100 transition-opacity">
                      <BookOpen size={16} />
                    </div>
                  </div>

                  <button
                    onClick={handleImportDict}
                    disabled={importing || !dictText.trim()}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        解析导入中...
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        导入并触发热更新
                      </>
                    )}
                  </button>

                  {importResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-3 rounded-xl border flex items-center gap-3 ${
                        importResult.success 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' 
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-600'
                      }`}
                    >
                      {importResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span className="text-xs font-medium">{importResult.message}</span>
                    </motion.div>
                  )}
                  
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                    <p className="text-[10px] text-amber-600 leading-normal">
                      💡 <b>提示：</b>导入后系统将自动重新构建 Aho-Corasick 自动机，无需重启即可在编辑器中享受最新的纠错体验。
                    </p>
                  </div>
                </div>
              ) : activeTab === 'theme' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Palette className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">主题配置导入与导出</h3>
                      <p className="text-[10px] text-muted-foreground">自定义菜单透明度、毛玻璃等外观参数</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={handleExportTheme}
                      className="p-4 bg-accent/10 border border-border/30 rounded-2xl hover:bg-accent/20 transition-all flex flex-col items-center gap-3 group"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Download className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-bold block">导出配置</span>
                        <span className="text-[10px] text-muted-foreground">保存当前主题为 JSON</span>
                      </div>
                    </button>

                    <label className="p-4 bg-accent/10 border border-border/30 rounded-2xl hover:bg-accent/20 transition-all flex flex-col items-center gap-3 group cursor-pointer">
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportTheme}
                      />
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FileJson className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-bold block">导入配置</span>
                        <span className="text-[10px] text-muted-foreground">上传 JSON 配置文件</span>
                      </div>
                    </label>
                  </div>

                  {themeImportSuccess && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 flex items-center gap-3"
                    >
                      <CheckCircle2 size={16} />
                      <span className="text-xs font-medium">主题配置导入成功并已应用</span>
                    </motion.div>
                  )}

                  {themeImportError && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 flex items-center gap-3"
                    >
                      <AlertCircle size={16} />
                      <span className="text-xs font-medium">{themeImportError}</span>
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    {renderThemeControl('Slash 菜单 (Slash Menu)', 'slashMenu')}
                    {renderThemeControl('文字菜单 (Text Menu)', 'textMenu')}
                    {renderThemeControl('块级菜单 (Block Menu)', 'blockMenu')}
                  </div>
                </div>
              ) : activeTab === 'qingzhi' ? (
                renderQingzhiSettings()
              ) : activeTab === 'vault' ? (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* v0.22.0 · 一键导出全部数据 */}
                  <div className="rounded-2xl border border-border/30 bg-accent/5 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Download className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold">一键导出全部数据</h3>
                        <p className="text-[10px] text-muted-foreground">
                          打包 SQLite / vault / 多媒体 / LocalStorage 为 zip,单机备份无需云同步
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportAll}
                        disabled={exporting}
                        className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-2 disabled:opacity-50 hover:opacity-90"
                      >
                        {exporting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        {exporting ? '打包中…' : '导出全部数据'}
                      </button>
                    </div>
                    {exportError && (
                      <div className="p-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-600 text-[11px]">
                        {exportError}
                      </div>
                    )}
                    {exportSuccess && (
                      <div className="p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 text-[11px]">
                        {exportSuccess}
                      </div>
                    )}
                  </div>

                  {/* v0.22.0 · 快照策略设置 */}
                  <div className="rounded-2xl border border-border/30 bg-accent/5 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <RefreshCw className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold">版本快照策略</h3>
                        <p className="text-[10px] text-muted-foreground">
                          编辑笔记时自动落一条历史版本,去抖避免过于频繁,保留最近 N 条 + 首版
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          去抖时长 (秒)
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={86400}
                          step={10}
                          value={revDebounce}
                          onChange={(e) => setRevDebounce(Number(e.target.value) || 0)}
                          disabled={revLoading}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border/40 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-[10px] text-muted-foreground/70">
                          两次自动快照间隔下限 · 默认 120s
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          保留条数 (+ 首版)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          step={1}
                          value={revMaxKeep}
                          onChange={(e) => setRevMaxKeep(Number(e.target.value) || 0)}
                          disabled={revLoading}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border/40 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-[10px] text-muted-foreground/70">
                          除首版外保留最近 N 条 · 默认 30
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px]">
                        {revNotice && (
                          <span className={revNotice.success ? 'text-emerald-600' : 'text-rose-500'}>
                            {revNotice.message}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={saveRevisionSettings}
                        disabled={revSaving || revLoading}
                        className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-2 disabled:opacity-50 hover:opacity-90"
                      >
                        {revSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        保存策略
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Database className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">Vault 本地仓库体检</h3>
                        <p className="text-[10px] text-muted-foreground">扫描缺失附件、孤儿附件、乱码风险和不安全引用</p>
                      </div>
                    </div>
                    <button
                      onClick={loadVaultHealth}
                      disabled={vaultHealthLoading}
                      className="px-3 py-2 rounded-xl bg-accent/20 hover:bg-accent/40 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${vaultHealthLoading ? 'animate-spin' : ''}`} />
                      刷新体检
                    </button>
                  </div>

                  {vaultHealthError && (
                    <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 text-xs">
                      {vaultHealthError}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl bg-accent/10 border border-border/20">
                      <div className="text-2xl font-black">{vaultHealth?.summary.total_issues ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">总问题</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-accent/10 border border-border/20">
                      <div className="text-2xl font-black">{vaultHealth?.summary.missing_attachments ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">缺失附件</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-accent/10 border border-border/20">
                      <div className="text-2xl font-black">{vaultHealth?.summary.orphan_attachments ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">孤儿附件</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(vaultHealth?.issues ?? []).slice(0, 30).map((issue, index) => (
                      <div
                        key={`${issue.type}-${index}`}
                        className="p-3 rounded-xl bg-background/50 border border-border/20 text-xs"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold">{issue.type}</span>
                          <span className={`text-[10px] uppercase ${
                            issue.severity === 'error' ? 'text-rose-500' : issue.severity === 'warning' ? 'text-amber-500' : 'text-muted-foreground'
                          }`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1">{issue.message}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1 break-all">
                          {issue.note_path || issue.asset_path || issue.target}
                        </p>
                      </div>
                    ))}
                    {!vaultHealthLoading && vaultHealth && vaultHealth.issues.length === 0 && (
                      <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 text-sm font-bold text-center">
                        Vault 体检未发现问题
                      </div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'updater' ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <UpdaterPanel className="space-y-4" />
                </div>
              ) : null}
            </div>

            <div className="px-6 py-4 bg-muted/30 border-t border-border/50 flex justify-between items-center">
              <div className="flex gap-2">
                {activeTab === 'ai' && (
                  <button
                    onClick={handleUpdateOllama}
                    disabled={updatingOllama}
                    className="flex items-center gap-2 px-4 py-2 bg-accent/20 hover:bg-accent/40 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                  >
                    {updatingOllama ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    检查并更新 Ollama 版本
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-foreground text-background rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
              >
                完成
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
