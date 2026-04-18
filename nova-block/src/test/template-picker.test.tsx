// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listTemplates: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

import { TemplatePicker } from '../components/editor/TemplatePicker'

describe('TemplatePicker', () => {
  beforeEach(() => {
    apiMock.listTemplates.mockReset()
    apiMock.deleteTemplate.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the UI editable after deleting templates without using native confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    apiMock.listTemplates.mockResolvedValue([
      { id: 1, name: 'alpha', content: '', icon: 'A', category: 'default', created_at: '', updated_at: '' },
      { id: 2, name: 'beta', content: '', icon: 'B', category: 'default', created_at: '', updated_at: '' },
    ])
    apiMock.deleteTemplate.mockResolvedValue({ status: 'ok' })

    render(
      <TemplatePicker
        isOpen
        mode="select"
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('alpha')).toBeTruthy()
    expect(await screen.findByText('beta')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('delete-template-1'))

    expect(screen.getByTestId('template-delete-confirm')).toBeTruthy()
    fireEvent.click(screen.getByTestId('template-delete-confirm-action'))

    await waitFor(() => {
      expect(apiMock.deleteTemplate).toHaveBeenCalledWith(1)
    })

    const searchInput = screen.getByRole('textbox')
    fireEvent.change(searchInput, { target: { value: 'beta' } })

    expect((searchInput as HTMLInputElement).value).toBe('beta')
    expect(screen.getByText('beta')).toBeTruthy()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
