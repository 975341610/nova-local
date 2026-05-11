import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * v0.19 B3 · Cadence meter
 * 底部 2px 节奏条 —— 每秒采样一次按键计数，形成 20 根细柱，
 * 随打字节奏起伏；空闲 ~3s 淡出。
 */
export function CadenceMeter() {
  const [samples, setSamples] = useState<number[]>(() => new Array(24).fill(0))
  const [visible, setVisible] = useState(false)
  const counterRef = useRef(0)
  const lastActiveAtRef = useRef<number>(Date.now())

  useEffect(() => {
    const onKey = () => {
      counterRef.current += 1
      lastActiveAtRef.current = Date.now()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      const c = counterRef.current
      counterRef.current = 0
      setSamples((prev) => {
        const next = prev.slice(1)
        next.push(c)
        return next
      })
      setVisible(Date.now() - lastActiveAtRef.current < 3500)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const maxVal = useMemo(() => Math.max(2, ...samples), [samples])

  return (
    <div
      className="nv-cadence"
      aria-hidden
      style={{
        opacity: visible ? 0.85 : 0,
        transition: 'opacity 360ms ease',
      }}
    >
      {samples.map((s, i) => {
        const h = Math.max(1, Math.round((s / maxVal) * 14))
        return (
          <div
            key={i}
            className="nv-cadence-bar"
            style={{
              height: `${h}px`,
              opacity: 0.28 + (s / maxVal) * 0.7,
            }}
          />
        )
      })}
    </div>
  )
}

export default CadenceMeter
