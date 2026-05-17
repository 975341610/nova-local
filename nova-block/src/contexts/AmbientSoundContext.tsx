/**
 * v0.19 B2 · Ambient Sound
 *
 * 零外部资源：使用 Web Audio API 合成 6 种氛围声
 *   - rain   (雨)
 *   - stream (溪)
 *   - teahouse (茶馆)
 *   - keyboard (键盘)
 *   - charcoal (炭火)
 *   - bamboo (竹林)
 *
 * 通过循环白噪声 + 带通滤波 + LFO 调制模拟各种氛围，
 * 避免打包音频文件带来的兼容/路径问题。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type AmbientId =
  | 'rain'
  | 'stream'
  | 'teahouse'
  | 'keyboard'
  | 'charcoal'
  | 'bamboo'

export interface AmbientMeta {
  id: AmbientId
  label: string
  icon: string
  hint: string
}

export const AMBIENT_LIST: AmbientMeta[] = [
  { id: 'rain', label: '雨', icon: '🌧️', hint: '雨声' },
  { id: 'stream', label: '溪', icon: '💧', hint: '小溪' },
  { id: 'teahouse', label: '茶馆', icon: '🫖', hint: '低语' },
  { id: 'keyboard', label: '键盘', icon: '⌨︎', hint: '键盘敲击' },
  { id: 'charcoal', label: '炭火', icon: '🔥', hint: '炭火噼啪' },
  { id: 'bamboo', label: '竹林', icon: '🎋', hint: '竹林风' },
]

interface AmbientCtxValue {
  activeId: AmbientId | null
  volume: number
  toggle: (id: AmbientId) => void
  setVolume: (v: number) => void
  stop: () => void
}

const AmbientContext = createContext<AmbientCtxValue | null>(null)

interface ActiveScene {
  ctx: AudioContext
  masterGain: GainNode
  stop: () => void
}

/**
 * 为指定 ambient 合成音频场景。
 */
function buildScene(ctx: AudioContext, master: GainNode, id: AmbientId): () => void {
  const nodes: AudioNode[] = []
  const intervals: number[] = []

  if (id === 'rain' || id === 'stream' || id === 'bamboo') {
    // 白噪声 + 带通滤波
    const bufferSize = 2 * ctx.sampleRate
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1

    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = id === 'rain' ? 0.8 : id === 'stream' ? 1.4 : 0.5
    filter.frequency.value = id === 'rain' ? 1200 : id === 'stream' ? 900 : 600

    const gain = ctx.createGain()
    gain.gain.value = id === 'bamboo' ? 0.42 : 0.6

    // LFO 给过滤器做风/水流起伏
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = id === 'bamboo' ? 0.15 : 0.35
    lfoGain.gain.value = id === 'rain' ? 260 : 160
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    noise.start()
    nodes.push(noise, filter, gain, lfo, lfoGain)
  } else if (id === 'teahouse') {
    // 低频嗡鸣 + 随机"杯碗"脉冲
    const bufferSize = 2 * ctx.sampleRate
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.6

    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    const gain = ctx.createGain()
    gain.gain.value = 0.5
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    noise.start()
    nodes.push(noise, filter, gain)

    const id1 = window.setInterval(() => {
      const osc = ctx.createOscillator()
      const og = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 680 + Math.random() * 400
      const now = ctx.currentTime
      og.gain.setValueAtTime(0.0001, now)
      og.gain.exponentialRampToValueAtTime(0.05, now + 0.02)
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
      osc.connect(og)
      og.connect(master)
      osc.start(now)
      osc.stop(now + 0.25)
    }, 1400)
    intervals.push(id1)
  } else if (id === 'keyboard') {
    // 离散的 click 触发（短噪声）
    const schedule = () => {
      const dur = 0.03
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        const env = 1 - i / data.length
        data[i] = (Math.random() * 2 - 1) * env
      }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 3200
      const g = ctx.createGain()
      g.gain.value = 0.35
      src.connect(hp)
      hp.connect(g)
      g.connect(master)
      src.start()
    }
    const id1 = window.setInterval(() => {
      if (Math.random() > 0.3) schedule()
    }, 160)
    intervals.push(id1)
  } else if (id === 'charcoal') {
    const bufferSize = 2 * ctx.sampleRate
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const out = buf.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) out[i] = (Math.random() * 2 - 1) * 0.4
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    noise.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 250
    const g = ctx.createGain()
    g.gain.value = 0.35
    noise.connect(f)
    f.connect(g)
    g.connect(master)
    noise.start()
    nodes.push(noise, f, g)

    // 噼啪声
    const pop = () => {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = 180 + Math.random() * 300
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.0001, now)
      og.gain.exponentialRampToValueAtTime(0.12, now + 0.005)
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
      osc.connect(og)
      og.connect(master)
      osc.start(now)
      osc.stop(now + 0.1)
    }
    const id1 = window.setInterval(() => {
      if (Math.random() > 0.5) pop()
    }, 700)
    intervals.push(id1)
  }

  return () => {
    for (const n of nodes) {
      try { (n as any).stop?.() } catch { /* ignore audio node cleanup errors */ }
      try { (n as any).disconnect?.() } catch { /* ignore audio node cleanup errors */ }
    }
    for (const i of intervals) clearInterval(i)
  }
}

export function AmbientSoundProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<AmbientId | null>(null)
  const [volume, _setVolume] = useState<number>(0.4)
  const sceneRef = useRef<ActiveScene | null>(null)
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  const stop = useCallback(() => {
    const s = sceneRef.current
    if (s) {
      try { s.stop() } catch { /* ignore audio stop errors */ }
      try { s.masterGain.disconnect() } catch { /* ignore gain cleanup errors */ }
      try { s.ctx.close() } catch { /* ignore already-closed audio contexts */ }
      sceneRef.current = null
    }
    setActiveId(null)
  }, [])

  const play = useCallback((id: AmbientId) => {
    stop()
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      const ctx: AudioContext = new AC()
      const master = ctx.createGain()
      master.gain.value = volumeRef.current
      master.connect(ctx.destination)
      const dispose = buildScene(ctx, master, id)
      sceneRef.current = {
        ctx,
        masterGain: master,
        stop: dispose,
      }
      setActiveId(id)
    } catch (err) {
      console.warn('[AmbientSound] failed to start', id, err)
    }
  }, [stop])

  const toggle = useCallback((id: AmbientId) => {
    if (activeId === id) { stop() } else { play(id) }
  }, [activeId, play, stop])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    _setVolume(clamped)
    if (sceneRef.current) {
      sceneRef.current.masterGain.gain.value = clamped
    }
  }, [])

  useEffect(() => () => { stop() }, [stop])

  const value = useMemo<AmbientCtxValue>(() => ({
    activeId, volume, toggle, setVolume, stop,
  }), [activeId, volume, toggle, setVolume, stop])

  return <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>
}

export function useAmbientSound() {
  const v = useContext(AmbientContext)
  if (!v) throw new Error('useAmbientSound must be used inside AmbientSoundProvider')
  return v
}
