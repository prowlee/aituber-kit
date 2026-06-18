/**
 * MemoryServiceInitializer Component Tests
 *
 * Tests for the memory service initialization component
 */

import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryServiceInitializer } from '@/components/memoryServiceInitializer'
import settingsStore from '@/features/stores/settings'

// Mock memoryStoreSync
const mockInitializeMemoryService = jest.fn().mockResolvedValue(undefined)
jest.mock('@/features/memory/memoryStoreSync', () => ({
  initializeMemoryService: (...args: unknown[]) =>
    mockInitializeMemoryService(...args),
}))

// Mock memoryService
const mockResetMemoryService = jest.fn()
jest.mock('@/features/memory/memoryService', () => ({
  resetMemoryService: (...args: unknown[]) => mockResetMemoryService(...args),
}))

describe('MemoryServiceInitializer', () => {
  const originalState = settingsStore.getState()

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      settingsStore.setState(originalState)
    })
  })

  afterEach(() => {
    act(() => {
      settingsStore.setState(originalState)
    })
  })

  it('should render null', () => {
    act(() => {
      settingsStore.setState({ memoryEnabled: false })
    })
    const { container } = render(<MemoryServiceInitializer />)
    expect(container.innerHTML).toBe('')
  })

  it('should call initializeMemoryService when memoryEnabled is true', async () => {
    act(() => {
      settingsStore.setState({ memoryEnabled: true })
    })
    render(<MemoryServiceInitializer />)
    await waitFor(() => {
      expect(mockInitializeMemoryService).toHaveBeenCalled()
    })
  })

  it('should not call initializeMemoryService when memoryEnabled is false', () => {
    act(() => {
      settingsStore.setState({ memoryEnabled: false })
    })
    render(<MemoryServiceInitializer />)
    expect(mockInitializeMemoryService).not.toHaveBeenCalled()
  })

  it('should call resetMemoryService when memoryEnabled changes from true to false', async () => {
    act(() => {
      settingsStore.setState({ memoryEnabled: true })
    })
    const { rerender } = render(<MemoryServiceInitializer />)

    await waitFor(() => {
      expect(mockInitializeMemoryService).toHaveBeenCalledTimes(1)
    })

    // Change memoryEnabled to false
    act(() => {
      settingsStore.setState({ memoryEnabled: false })
    })
    rerender(<MemoryServiceInitializer />)

    await waitFor(() => {
      expect(mockResetMemoryService).toHaveBeenCalled()
    })
  })
})
