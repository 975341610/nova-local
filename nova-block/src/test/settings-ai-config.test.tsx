// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getAIPluginStatus: vi.fn(),
    updateAIPluginConfig: vi.fn(),
    checkAIHardware: vi.fn(),
    updateOllama: vi.fn(),
    importDictionary: vi.fn(),
    getModelConfig: vi.fn(),
    updateModelConfig: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

vi.mock('../contexts/AIContext', () => ({
  useAI: () => ({
    isAiEnabled: true,
    setIsAiEnabled: vi.fn(),
    contextLength: 8192,
    setContextLength: vi.fn(),
    refreshAiStatus: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { SettingsDialog } from '../components/SettingsDialog'

describe('SettingsDialog AI config', () => {
  beforeEach(() => {
    apiMock.getModelConfig.mockReset()
    apiMock.updateModelConfig.mockReset()
    apiMock.getAIPluginStatus.mockReset()
    apiMock.checkAIHardware.mockReset()
    apiMock.updateOllama.mockReset()
    apiMock.importDictionary.mockReset()
  })

  it('loads and saves remote AI model config from settings', async () => {
    apiMock.getModelConfig.mockResolvedValue({
      provider: 'openai',
      api_key: 'sk-test',
      base_url: 'https://api.openai.com/v1',
      model_name: 'gpt-4o-mini',
    })
    apiMock.updateModelConfig.mockResolvedValue({
      provider: 'openai',
      api_key: 'sk-next',
      base_url: 'https://example.com/v1',
      model_name: 'gpt-4.1-mini',
    })

    render(<SettingsDialog isOpen onClose={() => {}} />)

    const apiKeyInput = await screen.findByTestId('ai-model-api-key')
    const baseUrlInput = screen.getByTestId('ai-model-base-url')
    const modelInput = screen.getByTestId('ai-model-name')
    const saveButton = screen.getByTestId('ai-model-save')

    expect((apiKeyInput as HTMLInputElement).value).toBe('sk-test')
    expect((baseUrlInput as HTMLInputElement).value).toBe('https://api.openai.com/v1')
    expect((modelInput as HTMLInputElement).value).toBe('gpt-4o-mini')

    fireEvent.change(apiKeyInput, { target: { value: 'sk-next' } })
    fireEvent.change(baseUrlInput, { target: { value: 'https://example.com/v1' } })
    fireEvent.change(modelInput, { target: { value: 'gpt-4.1-mini' } })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(apiMock.updateModelConfig).toHaveBeenCalledWith({
        provider: 'openai',
        api_key: 'sk-next',
        base_url: 'https://example.com/v1',
        model_name: 'gpt-4.1-mini',
      })
    })
  })
})
