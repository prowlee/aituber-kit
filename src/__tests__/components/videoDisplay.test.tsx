import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { VideoDisplay } from '@/components/common/VideoDisplay'

let mockSettingsState = {
  useVideoAsBackground: false,
  hideVideoDisplay: false,
}

jest.mock('@/features/stores/home', () => {
  const mockStore = jest.fn((selector) =>
    selector({
      triggerShutter: false,
    })
  )
  mockStore.setState = jest.fn()
  return {
    __esModule: true,
    default: mockStore,
  }
})

jest.mock('@/features/stores/settings', () => {
  const mockStore = jest.fn((selector) => selector(mockSettingsState))
  mockStore.setState = jest.fn((state) => {
    mockSettingsState = {
      ...mockSettingsState,
      ...state,
    }
  })
  return {
    __esModule: true,
    default: mockStore,
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/components/iconButton', () => ({
  IconButton: ({ onClick, disabled, iconName }: any) => (
    <button onClick={onClick} disabled={disabled} data-icon-name={iconName} />
  ),
}))

jest.mock('@/hooks/useDraggable', () => {
  const mockPosition = { x: 0, y: 0 }
  const mockStyle = {}
  const mockHandleMouseDown = jest.fn()
  const mockResetPosition = jest.fn()
  const mockSetPosition = jest.fn()

  return {
    useDraggable: () => ({
      position: mockPosition,
      isMobile: false,
      handleMouseDown: mockHandleMouseDown,
      resetPosition: mockResetPosition,
      setPosition: mockSetPosition,
      style: mockStyle,
    }),
  }
})

jest.mock('@/hooks/useResizable', () => {
  const mockSize = { width: 512, height: 384 }
  const mockHandleResizeStart = jest.fn()
  const mockSetSize = jest.fn()

  return {
    useResizable: () => ({
      size: mockSize,
      isResizing: false,
      handleResizeStart: mockHandleResizeStart,
      setSize: mockSetSize,
    }),
  }
})

describe('VideoDisplay', () => {
  const playMock = jest.fn(() => Promise.resolve())

  beforeAll(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      writable: true,
      value: null,
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: playMock,
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockSettingsState = {
      useVideoAsBackground: false,
      hideVideoDisplay: false,
    }
    HTMLMediaElement.prototype.srcObject = null
  })

  it('syncs a newly selected media stream to the main video immediately', async () => {
    const videoRef = React.createRef<HTMLVideoElement>()
    const stream = { id: 'display-stream' } as MediaStream
    const { rerender } = render(
      <VideoDisplay videoRef={videoRef} mediaStream={null} />
    )

    expect(videoRef.current?.srcObject).toBeNull()

    rerender(<VideoDisplay videoRef={videoRef} mediaStream={stream} />)

    await waitFor(() => {
      expect(videoRef.current?.srcObject).toBe(stream)
    })
    expect(playMock).toHaveBeenCalled()
  })

  it('clears the main video when media stream is removed', async () => {
    const videoRef = React.createRef<HTMLVideoElement>()
    const stream = { id: 'display-stream' } as MediaStream
    const { rerender } = render(
      <VideoDisplay videoRef={videoRef} mediaStream={stream} />
    )

    await waitFor(() => {
      expect(videoRef.current?.srcObject).toBe(stream)
    })

    rerender(<VideoDisplay videoRef={videoRef} mediaStream={null} />)

    await waitFor(() => {
      expect(videoRef.current?.srcObject).toBeNull()
    })
  })
})
