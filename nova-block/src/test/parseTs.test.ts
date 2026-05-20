/**
 * Tests for parseTs — 修正"无时区后缀的 ISO 被当作本地时间"导致的分组漂移。
 *
 * 回归 Bug 3 (F2c-3): 后端 SQLAlchemy `datetime.utcnow().isoformat()` 输出
 * 形如 `2026-05-19T11:30:00.123456` 无 timezone suffix 的字符串。浏览器
 * `Date.parse()` 把它当作本地时间解析,在 UTC+8 客户端会比真实 UTC 时间
 * 早 8 小时,跨 UTC 零点附近的笔记被错误分到"昨天"或"更早"桶。
 */
import { describe, it, expect } from 'vitest'
import { parseTs } from '../lib/novablock/parseTs'

describe('parseTs', () => {
  it('原样透传有限数字', () => {
    expect(parseTs(0)).toBe(0)
    expect(parseTs(1700000000000)).toBe(1700000000000)
  })

  it('非有限数字返回 0', () => {
    expect(parseTs(NaN)).toBe(0)
    expect(parseTs(Infinity)).toBe(0)
    expect(parseTs(-Infinity)).toBe(0)
  })

  it('非字符串非数字返回 0', () => {
    expect(parseTs(null)).toBe(0)
    expect(parseTs(undefined)).toBe(0)
    expect(parseTs({})).toBe(0)
    expect(parseTs([])).toBe(0)
    expect(parseTs('')).toBe(0)
  })

  it('带 Z 后缀的 ISO 解析为 UTC', () => {
    const t = parseTs('2026-05-19T11:30:00.000Z')
    expect(t).toBe(Date.UTC(2026, 4, 19, 11, 30, 0))
  })

  it('带 +hh:mm 后缀的 ISO 解析正确', () => {
    const t = parseTs('2026-05-19T19:30:00+08:00')
    expect(t).toBe(Date.UTC(2026, 4, 19, 11, 30, 0))
  })

  it('无时区后缀的 ISO 当作 UTC 解析 (回归 Bug 3)', () => {
    const t = parseTs('2026-05-19T11:30:00')
    // 关键:必须等于 UTC 时间,不依赖本地时区
    expect(t).toBe(Date.UTC(2026, 4, 19, 11, 30, 0))
  })

  it('无时区后缀且带微秒的 ISO 当作 UTC (后端默认格式)', () => {
    const t = parseTs('2026-05-19T11:30:00.123456')
    // Date.parse 只支持毫秒精度,微秒会被截断或忽略,但日期部分一定是 UTC
    // 允许 ±1ms 误差
    const expected = Date.UTC(2026, 4, 19, 11, 30, 0, 123)
    expect(Math.abs(t - expected)).toBeLessThanOrEqual(1)
  })

  it('SQL space-separated datetime 视为 UTC', () => {
    const t = parseTs('2026-05-19 11:30:00')
    expect(t).toBe(Date.UTC(2026, 4, 19, 11, 30, 0))
  })

  it('跨 UTC 零点的笔记不会被错分桶 (核心回归)', () => {
    // 假设两个笔记同时在 UTC 16:00 创建(UTC+8 = 次日 00:00)
    const noteA = parseTs('2026-05-19T16:00:00')
    const noteB = parseTs('2026-05-19T16:00:01')
    // 在 UTC 视角下都是 5/19,差 1 秒
    expect(noteB - noteA).toBe(1000)
    // 不会因本地时区把同时创建的笔记拉开 8 小时差
  })

  it('小写 z 也识别为时区后缀', () => {
    const t = parseTs('2026-05-19T11:30:00z')
    expect(t).toBe(Date.UTC(2026, 4, 19, 11, 30, 0))
  })

  it('malformed string 返回 0 (Date.parse NaN)', () => {
    expect(parseTs('not-a-date')).toBe(0)
    expect(parseTs('2026-13-99')).toBe(0)
  })
})
