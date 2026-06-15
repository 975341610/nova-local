import { describe, expect, it } from 'vitest'

import { AILoadingNode } from '../../components/novablock/extensions/AILoadingNode'

describe('AILoadingNode', () => {
  it('keeps the inline loading placeholder contract', () => {
    expect(AILoadingNode.name).toBe('aiLoadingPlaceholder')
    expect(AILoadingNode.config.inline).toBe(true)
    expect(AILoadingNode.config.group).toBe('inline')
    expect(AILoadingNode.config.atom).toBe(true)

    const parseRules = AILoadingNode.config.parseHTML?.call({
      name: AILoadingNode.name,
      options: {},
      storage: {},
      parent: undefined,
    })
    expect(parseRules).toEqual([{ tag: 'img[data-ai-loading]' }])
  })
})
