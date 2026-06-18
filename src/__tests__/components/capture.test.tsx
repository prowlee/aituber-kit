import React from 'react'
import { render, waitFor } from '@testing-library/react'
import Capture from '@/components/capture'

const registerCaptureFunctionMock = jest.fn()

jest.mock('@/features/stores/home', () => {
  const mockStore = jest.fn()
  mockStore.setState = jest.fn()
  return {
    __esModule: true,
    default: mockStore,
  }
})

jest.mock('@/features/gameCommentary/captureService', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      registerCaptureFunction: registerCaptureFunctionMock,
    })),
  },
}))

jest.mock('@/components/common/VideoDisplay', () => ({
  VideoDisplay: ({ videoRef, mediaStream }: any) => {
    React.useEffect(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream ?? null
      }
    }, [mediaStream, videoRef])

    return <video ref={videoRef} data-testid="capture-video" />
  },
}))

describe('Capture', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      writable: true,
      value: null,
    })
  })

  it('does not stop an initial stream during component unmount cleanup', async () => {
    const stop = jest.fn()
    const stream = {
      getTracks: jest.fn(() => [{ stop }]),
      getVideoTracks: jest.fn(() => [{ addEventListener: jest.fn() }]),
    } as unknown as MediaStream
    const onStreamChange = jest.fn()

    const { unmount } = render(
      <Capture initialStream={stream} onStreamChange={onStreamChange} />
    )

    await waitFor(() => {
      expect(onStreamChange).toHaveBeenCalledWith(stream)
    })

    unmount()

    expect(stop).not.toHaveBeenCalled()
  })
})
