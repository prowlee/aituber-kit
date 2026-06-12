/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { useAudioProcessing } from '@/hooks/useAudioProcessing'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Store original values for cleanup
const originalAudioContext = (window as any).AudioContext
const originalWebkitAudioContext = (window as any).webkitAudioContext
const originalMediaRecorder = (window as any).MediaRecorder
const originalMediaDevices = (navigator as any).mediaDevices

// Mock AudioContext
const mockAudioContextClose = jest.fn().mockResolvedValue(undefined)
const mockDecodeAudioData = jest.fn().mockResolvedValue({
  duration: 1.0,
  sampleRate: 16000,
  numberOfChannels: 1,
})

const mockAudioContextInstance = {
  close: mockAudioContextClose,
  decodeAudioData: mockDecodeAudioData,
}

const MockAudioContext = jest.fn().mockImplementation(() => {
  return mockAudioContextInstance
})

// Setup global AudioContext
Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: MockAudioContext,
})

Object.defineProperty(window, 'webkitAudioContext', {
  writable: true,
  value: MockAudioContext,
})

// Mock MediaRecorder
const mockMediaRecorderStop = jest.fn()
const mockMediaRecorderStart = jest.fn()

const mockMediaRecorderInstance = {
  state: 'inactive',
  stop: mockMediaRecorderStop,
  start: mockMediaRecorderStart,
  stream: {
    getTracks: () => [{ stop: jest.fn(), id: '1', kind: 'audio' }],
  },
  mimeType: 'audio/webm',
  ondataavailable: null as ((event: { data: Blob }) => void) | null,
  onstop: null as (() => void) | null,
}

const MockMediaRecorder = jest.fn().mockImplementation(() => {
  return { ...mockMediaRecorderInstance, state: 'recording' }
})

Object.defineProperty(window, 'MediaRecorder', {
  writable: true,
  value: MockMediaRecorder,
})

// Mock MediaRecorder.isTypeSupported
;(MockMediaRecorder as any).isTypeSupported = jest.fn((mimeType: string) => {
  const supportedTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4']
  return supportedTypes.includes(mimeType)
})

// Mock navigator.mediaDevices.getUserMedia
const mockGetUserMedia = jest.fn().mockResolvedValue({
  getTracks: () => [{ stop: jest.fn() }],
})

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: { getUserMedia: mockGetUserMedia },
})

describe('useAudioProcessing', () => {
  afterAll(() => {
    // Restore original values
    ;(window as any).AudioContext = originalAudioContext
    ;(window as any).webkitAudioContext = originalWebkitAudioContext
    ;(window as any).MediaRecorder = originalMediaRecorder
    ;(navigator as any).mediaDevices = originalMediaDevices
  })

  beforeEach(() => {
    jest.clearAllMocks()
    MockAudioContext.mockClear()
  })

  describe('AudioContextの遅延初期化', () => {
    it('マウント時にはAudioContextが生成されない', () => {
      const { unmount } = renderHook(() => useAudioProcessing())

      // マウントしただけではAudioContextは生成されない
      expect(MockAudioContext).not.toHaveBeenCalled()

      unmount()
    })

    it('getAudioContextの初回呼び出し時に1回だけ生成され、以降は再利用される', () => {
      const { result, unmount } = renderHook(() => useAudioProcessing())

      const first = result.current.getAudioContext()
      const second = result.current.getAudioContext()

      expect(MockAudioContext).toHaveBeenCalledTimes(1)
      expect(first).toBe(second)
      expect(first).toBe(mockAudioContextInstance)

      unmount()
    })

    it('decodeAudioDataの呼び出しでAudioContextが遅延生成される', async () => {
      const { result, unmount } = renderHook(() => useAudioProcessing())

      expect(MockAudioContext).not.toHaveBeenCalled()

      await act(async () => {
        await result.current.decodeAudioData(new ArrayBuffer(8))
        await result.current.decodeAudioData(new ArrayBuffer(8))
      })

      // 複数回デコードしてもAudioContextは1回だけ生成される
      expect(MockAudioContext).toHaveBeenCalledTimes(1)
      expect(mockDecodeAudioData).toHaveBeenCalledTimes(2)

      unmount()
    })

    it('startRecordingではAudioContextは生成されない', async () => {
      const { result, unmount } = renderHook(() => useAudioProcessing())

      // 録音を開始してmediaRecorderの状態を変化させる
      await act(async () => {
        await result.current.startRecording()
      })

      // 録音だけではAudioContextは不要なので生成されない
      expect(MockAudioContext).not.toHaveBeenCalled()

      unmount()
    })

    it('生成済みのAudioContextはアンマウント時にクローズされる', async () => {
      const { result, unmount } = renderHook(() => useAudioProcessing())

      await act(async () => {
        await result.current.decodeAudioData(new ArrayBuffer(8))
      })

      unmount()

      // AudioContextがクローズされたことを確認
      expect(mockAudioContextClose).toHaveBeenCalled()
    })

    it('未生成のままアンマウントしてもcloseは呼ばれない', () => {
      const { unmount } = renderHook(() => useAudioProcessing())

      unmount()

      expect(mockAudioContextClose).not.toHaveBeenCalled()
    })
  })

  describe('MIMEタイプ選択の最適化 (Requirement 9)', () => {
    beforeEach(() => {
      // isTypeSupportedのモックをリセット
      ;(MockMediaRecorder as any).isTypeSupported = jest.fn(
        (mimeType: string) => {
          const supportedTypes = [
            'audio/webm',
            'audio/webm;codecs=opus',
            'audio/mp4',
          ]
          return supportedTypes.includes(mimeType)
        }
      )
    })

    it('audio/webm;codecs=opusが優先的に選択される（Chrome/Edge）', async () => {
      const { result } = renderHook(() => useAudioProcessing())

      // 録音を開始
      await act(async () => {
        await result.current.startRecording()
      })

      // MediaRecorderがaudio/webm;codecs=opusで作成されていることを確認
      const calls = MockMediaRecorder.mock.calls
      expect(calls.length).toBeGreaterThan(0)

      const options = calls[calls.length - 1][1]
      // audio/webm;codecs=opusが優先的に選択されることを確認
      expect(options.mimeType).toBe('audio/webm;codecs=opus')
    })

    it('audio/mp3は低優先度として扱われる', async () => {
      // mp3のみサポートするブラウザをシミュレート
      ;(MockMediaRecorder as any).isTypeSupported = jest.fn(
        (mimeType: string) => {
          return mimeType === 'audio/mp3'
        }
      )

      const { result } = renderHook(() => useAudioProcessing())

      // 録音を開始
      await act(async () => {
        await result.current.startRecording()
      })

      // mp3がサポートされている場合は選択される（フォールバック）
      const calls = MockMediaRecorder.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const options = calls[calls.length - 1][1]
      expect(options.mimeType).toBe('audio/mp3')
    })

    it('Safari環境ではaudio/mp4が選択される', async () => {
      // Safari環境をシミュレート（audio/mp4のみサポート）
      ;(MockMediaRecorder as any).isTypeSupported = jest.fn(
        (mimeType: string) => {
          return mimeType === 'audio/mp4'
        }
      )

      const { result } = renderHook(() => useAudioProcessing())

      // 録音を開始
      await act(async () => {
        await result.current.startRecording()
      })

      // Safari環境ではaudio/mp4が選択される
      const calls = MockMediaRecorder.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const options = calls[calls.length - 1][1]
      expect(options.mimeType).toBe('audio/mp4')
    })
  })
})
