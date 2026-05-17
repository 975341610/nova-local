import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '../..')
const settingsDialog = readFileSync(resolve(projectRoot, 'src/components/SettingsDialog.tsx'), 'utf-8')

describe('QingZhi settings panel contract', () => {
  it('matches the QingZhi topbar customization layout', () => {
    const requiredMarkers = [
      "activeTab === 'qingzhi'",
      'Settings · 顶栏常驻按钮自定义',
      '设置 → 外观 → 顶栏 · 默认 4 项',
      '顶栏常驻按钮',
      '已选 · 拖拽排序',
      '候选库 · 点击 + 加入顶栏',
      '已用 {selectedActions.length} / 4',
      '立绘水印不透明度',
      'data-testid="qingzhi-pinned-zone"',
      'data-testid="qingzhi-selected-pins"',
      'data-testid="qingzhi-candidate-pool"',
      'qz-settings-panel',
      'qz-settings-card',
      'qz-settings-selected-zone',
      'qz-settings-candidate-grid',
      'qz-settings-range-card',
      'qz-settings-range',
      'data-testid={`qingzhi-pin-toggle-${action.id}`}',
      'data-qz-pin={action.id}',
      'data-testid="qingzhi-mascot-opacity"',
      'data-range="mascot-opacity"',
      'saveQingzhiSettings',
    ]

    for (const marker of requiredMarkers) {
      expect(settingsDialog, `${marker} should be present`).toContain(marker)
    }
  })
})
