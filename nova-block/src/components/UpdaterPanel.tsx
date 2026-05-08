/**
 * UpdaterPanel — M4
 *
 * Three-tab UI for the in-app updater:
 *   1. 检查更新 — pick .nova-update → verify (manifest preview) → install
 *   2. 版本管理 — list installed versions, badge current/rollback, switch
 *   3. 崩溃报告 — read crash.log, one-click rollback to previous
 *
 * All side effects go through updaterApi — there is NO direct ipcRenderer
 * usage here, so the component is cleanly unit-testable with vi.mock.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  updaterApi,
  type InstalledVersion,
  type PackageManifest,
  type CrashEntry,
  type RemoteCheckResult,
} from '../lib/updaterApi'
// v0.23.4: import styles from the component so Rolldown / Tailwind JIT treats
// them as a module dependency. Without this, the global @import in index.css
// was being tree-shaken on production builds, leaving the Updater tab
// rendering as unstyled text ("UI styling error" in v0.23.3 reports).
import '../styles/updater.css'

type SubTab = 'check' | 'manage' | 'crash'

export interface UpdaterPanelProps {
  className?: string
}

export const UpdaterPanel: React.FC<UpdaterPanelProps> = ({ className }) => {
  const [tab, setTab] = useState<SubTab>('check')
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null)

  // Refresh top-level state whenever we mount or an action may have changed it.
  // v0.23.3: do NOT use Promise.all — if get-rollback-target rejects (e.g. when
  // the Python sidecar momentarily errors), Promise.all rejects too and
  // setCurrentVersion is never called, leaving the header stuck at "—" even
  // though the IPC for the current version succeeded.
  const refreshMeta = useCallback(async () => {
    try {
      const cur = await updaterApi.getCurrentVersion()
      setCurrentVersion(cur)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('updater getCurrentVersion failed', err)
    }
    try {
      const rb = await updaterApi.getRollbackTarget()
      setRollbackTarget(rb)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('updater getRollbackTarget failed', err)
    }
  }, [])

  useEffect(() => {
    void refreshMeta()
  }, [refreshMeta])

  return (
    <div className={className} data-testid="updater-panel">
      <header className="updater-header">
        <div>
          <span className="updater-header-label">当前版本</span>
          <strong data-testid="updater-current-version">
            {currentVersion ?? '—'}
          </strong>
        </div>
        {rollbackTarget ? (
          <div>
            <span className="updater-header-label">回滚点</span>
            <strong>{rollbackTarget}</strong>
          </div>
        ) : null}
      </header>

      <div role="tablist" className="updater-tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'check'}
          onClick={() => setTab('check')}
        >
          检查更新
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'manage'}
          onClick={() => setTab('manage')}
        >
          版本管理
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'crash'}
          onClick={() => setTab('crash')}
        >
          崩溃报告
        </button>
      </div>

      <div className="updater-tabpanel">
        {tab === 'check' ? (
          <CheckUpdatesTab onInstalled={refreshMeta} />
        ) : null}
        {tab === 'manage' ? (
          <ManageVersionsTab onSwitched={refreshMeta} />
        ) : null}
        {tab === 'crash' ? (
          <CrashReportsTab rollbackTarget={rollbackTarget} onRolledBack={refreshMeta} />
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 1 — Check updates
// ---------------------------------------------------------------------------

const CheckUpdatesTab: React.FC<{ onInstalled: () => Promise<void> }> = ({
  onInstalled,
}) => {
  const [path, setPath] = useState<string | null>(null)
  const [manifest, setManifest] = useState<PackageManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState<string | null>(null)

  // v0.23.3 · remote auto-update
  const [remote, setRemote] = useState<RemoteCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [autoInstalling, setAutoInstalling] = useState(false)

  const checkRemote = useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      const r = await updaterApi.checkRemote()
      setRemote(r)
    } catch (err: any) {
      setError(err?.message ?? '在线检查失败')
    } finally {
      setChecking(false)
    }
  }, [])

  const installRemote = useCallback(async () => {
    if (!remote?.package_url) return
    setAutoInstalling(true)
    setError(null)
    setInstallMsg(null)
    try {
      const r = await updaterApi.downloadAndInstall(remote.package_url)
      setInstallMsg(
        r.success
          ? `安装成功 ${r.target_version}(请重启应用生效)`
          : '安装返回 success=false',
      )
      await onInstalled()
    } catch (err: any) {
      setError(err?.message ?? '在线更新失败')
    } finally {
      setAutoInstalling(false)
    }
  }, [remote, onInstalled])

  const pick = useCallback(async () => {
    setError(null)
    setManifest(null)
    setInstallMsg(null)
    const picked = await updaterApi.pickPackageFile()
    if (!picked) return
    setPath(picked)
    setVerifying(true)
    try {
      const m = await updaterApi.verify(picked)
      setManifest(m)
    } catch (err: any) {
      setError(err?.message ?? '校验失败')
    } finally {
      setVerifying(false)
    }
  }, [])

  const install = useCallback(async () => {
    if (!path || !manifest) return
    setInstalling(true)
    setError(null)
    try {
      const imp = await updaterApi.importPackage(path)
      const result = await updaterApi.install(imp.package_id)
      setInstallMsg(
        result.success
          ? `安装成功 ${result.target_version}(请重启应用生效)`
          : '安装返回 success=false',
      )
      await onInstalled()
    } catch (err: any) {
      setError(err?.message ?? '安装失败')
    } finally {
      setInstalling(false)
    }
  }, [path, manifest, onInstalled])

  return (
    <div className="updater-check">
      {/* v0.23.3 · 在线检查 */}
      <section className="updater-remote">
        <div className="updater-remote-row">
          <button
            type="button"
            onClick={checkRemote}
            disabled={checking || autoInstalling}
          >
            {checking ? '检查中…' : '检查在线更新'}
          </button>
          {remote && remote.enabled === false ? (
            <span className="updater-remote-hint">
              未配置在线更新源（data/updater_config.json
              缺失）。仍可使用下面的本地包安装。
            </span>
          ) : null}
          {remote && remote.enabled && remote.error ? (
            <span className="updater-remote-hint updater-remote-error">
              检查失败：{remote.error}
            </span>
          ) : null}
          {remote && remote.enabled && !remote.error && !remote.available ? (
            <span className="updater-remote-hint">
              当前 {remote.current ?? '—'} 已是最新版本
              {remote.latest ? `（远端 ${remote.latest}）` : ''}。
            </span>
          ) : null}
        </div>
        {remote && remote.available && remote.package_url ? (
          <div className="updater-remote-card">
            <div>
              <strong>发现新版本 {remote.latest}</strong>
              <span className="updater-remote-channel">
                通道：{remote.channel}
              </span>
            </div>
            {remote.release_notes_md ? (
              <pre className="updater-release-notes">
                {remote.release_notes_md}
              </pre>
            ) : null}
            <button
              type="button"
              onClick={installRemote}
              disabled={autoInstalling}
            >
              {autoInstalling
                ? '正在下载并安装…'
                : `下载并安装 ${remote.latest}`}
            </button>
          </div>
        ) : null}
      </section>

      <button type="button" onClick={pick} disabled={verifying || installing}>
        选择 .nova-update 包
      </button>

      {path ? (
        <p className="updater-path" data-testid="updater-picked-path">
          {path}
        </p>
      ) : null}

      {verifying ? <p>正在校验…</p> : null}

      {error ? (
        <p role="alert" className="updater-error" data-testid="updater-error">
          {error}
        </p>
      ) : null}

      {manifest ? (
        <section data-testid="updater-manifest" className="updater-manifest">
          <dl>
            <dt>package_id</dt>
            <dd>{manifest.package_id}</dd>
            <dt>目标版本</dt>
            <dd>{manifest.target_version}</dd>
            <dt>最低基线</dt>
            <dd>{manifest.min_base_version}</dd>
            <dt>通道</dt>
            <dd>{manifest.channel}</dd>
            <dt>需重启</dt>
            <dd>{manifest.restart_required ? '是' : '否'}</dd>
          </dl>
          <pre className="updater-release-notes">{manifest.release_notes_md}</pre>
        </section>
      ) : null}

      <button
        type="button"
        onClick={install}
        disabled={!manifest || installing || verifying}
      >
        {installing ? '正在安装…' : '安装'}
      </button>

      {installMsg ? <p className="updater-success">{installMsg}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — Manage versions
// ---------------------------------------------------------------------------

const ManageVersionsTab: React.FC<{ onSwitched: () => Promise<void> }> = ({
  onSwitched,
}) => {
  const [versions, setVersions] = useState<InstalledVersion[] | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [vs, rb] = await Promise.all([
        updaterApi.listVersions(),
        updaterApi.getRollbackTarget(),
      ])
      setVersions(vs)
      setRollbackTarget(rb)
    } catch (err: any) {
      setError(err?.message ?? '读取版本失败')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onSwitch = useCallback(
    async (v: string) => {
      setSwitching(v)
      setError(null)
      try {
        await updaterApi.switchTo(v)
        await refresh()
        await onSwitched()
      } catch (err: any) {
        setError(err?.message ?? '切换失败')
      } finally {
        setSwitching(null)
      }
    },
    [refresh, onSwitched],
  )

  if (!versions) return <p>加载中…</p>

  return (
    <div className="updater-manage">
      {error ? (
        <p role="alert" className="updater-error">
          {error}
        </p>
      ) : null}
      <ul className="updater-version-list">
        {versions.map((v) => (
          <li key={v.version} data-version-row={v.version} className="updater-version-row">
            <span className="updater-version-label">{v.version}</span>
            {v.is_current ? <span className="updater-badge">当前</span> : null}
            {!v.is_current && rollbackTarget === v.version ? (
              <span className="updater-badge updater-badge-rollback">回滚点</span>
            ) : null}
            <span className="updater-version-installed">{v.installed_at}</span>
            <button
              type="button"
              disabled={v.is_current || switching === v.version}
              onClick={() => onSwitch(v.version)}
            >
              {switching === v.version ? '切换中…' : `切换到 ${v.version}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3 — Crash reports
// ---------------------------------------------------------------------------

const CrashReportsTab: React.FC<{
  rollbackTarget: string | null
  onRolledBack: () => Promise<void>
}> = ({ rollbackTarget, onRolledBack }) => {
  const [crashes, setCrashes] = useState<CrashEntry[] | null>(null)
  const [rolling, setRolling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await updaterApi.readCrashLog()
      if (!cancelled) setCrashes(list)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const rollback = useCallback(async () => {
    if (!rollbackTarget) return
    setRolling(true)
    setError(null)
    try {
      await updaterApi.switchTo(rollbackTarget)
      await onRolledBack()
    } catch (err: any) {
      setError(err?.message ?? '回滚失败')
    } finally {
      setRolling(false)
    }
  }, [rollbackTarget, onRolledBack])

  if (!crashes) return <p>加载中…</p>

  if (crashes.length === 0) {
    return (
      <div className="updater-crash-empty">
        <p>暂无崩溃记录</p>
      </div>
    )
  }

  return (
    <div className="updater-crash">
      {error ? (
        <p role="alert" className="updater-error">
          {error}
        </p>
      ) : null}
      <ul>
        {crashes.map((c, i) => (
          <li key={`${c.timestamp}-${i}`}>
            <span>{c.timestamp}</span>
            <span>v{c.version}</span>
            <span>{c.reason}</span>
          </li>
        ))}
      </ul>
      {rollbackTarget ? (
        <button type="button" onClick={rollback} disabled={rolling}>
          {rolling ? '回滚中…' : `回滚到 ${rollbackTarget}`}
        </button>
      ) : (
        <p>无可回滚的历史版本</p>
      )}
    </div>
  )
}

export default UpdaterPanel
