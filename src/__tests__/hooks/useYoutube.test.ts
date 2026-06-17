/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import useYoutube from '@/components/useYoutube'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { useOneComme } from '@/features/youtube/useOneComme'
import {
  fetchAndProcessComments,
  resetYoutubeState,
  YouTubeComment,
} from '@/features/youtube/youtubeComments'

const mockUseOneComme = useOneComme as jest.Mock
const mockFetchAndProcessComments = fetchAndProcessComments as jest.Mock
const mockResetYoutubeState = resetYoutubeState as jest.Mock

let mockSettingsState: Record<string, unknown>
let mockHomeState: Record<string, unknown>
let latestOneCommeParams:
  | {
      enabled: boolean
      port: number
      commentBufferRef: { current: YouTubeComment[] }
    }
  | undefined
let consoleLogSpy: jest.SpyInstance

jest.mock('@/features/stores/settings', () => {
  const mockFn = jest.fn()
  return {
    __esModule: true,
    default: Object.assign(mockFn, {
      getState: jest.fn(),
      setState: jest.fn(),
    }),
  }
})

jest.mock('@/features/stores/home', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(),
  },
}))

jest.mock('@/features/youtube/useOneComme', () => ({
  useOneComme: jest.fn(),
}))

jest.mock('@/features/youtube/youtubeComments', () => ({
  fetchAndProcessComments: jest.fn(),
  resetYoutubeState: jest.fn(),
}))

function setupSettingsState(overrides: Record<string, unknown> = {}) {
  mockSettingsState = {
    youtubeMode: true,
    youtubePlaying: true,
    youtubeCommentSource: 'onecomme',
    youtubeCommentInterval: 5,
    onecommePort: 11180,
    youtubeLiveId: '',
    youtubeApiKey: '',
    ...overrides,
  }

  const mockedSettingsStore = settingsStore as unknown as jest.Mock & {
    getState: jest.Mock
    setState: jest.Mock
  }
  mockedSettingsStore.mockImplementation(
    (selector: (state: typeof mockSettingsState) => unknown) =>
      selector(mockSettingsState)
  )
  mockedSettingsStore.getState.mockImplementation(() => mockSettingsState)
  mockedSettingsStore.setState.mockImplementation(
    (partial: Partial<typeof mockSettingsState>) => {
      mockSettingsState = { ...mockSettingsState, ...partial }
    }
  )
}

function setupHomeState(overrides: Record<string, unknown> = {}) {
  mockHomeState = {
    chatProcessing: false,
    chatProcessingCount: 0,
    isSpeaking: false,
    ...overrides,
  }

  const mockedHomeStore = homeStore as unknown as {
    getState: jest.Mock
  }
  mockedHomeStore.getState.mockImplementation(() => mockHomeState)
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useYoutube', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    setupSettingsState()
    setupHomeState()
    latestOneCommeParams = undefined
    mockUseOneComme.mockImplementation((params) => {
      latestOneCommeParams = params
      return {
        isConnected: true,
        isLoading: false,
        error: null,
      }
    })
    mockFetchAndProcessComments.mockResolvedValue(undefined)
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    jest.useRealTimers()
  })

  it('drains buffered OneComme comments on each polling interval', async () => {
    const handleSendChat = jest.fn().mockResolvedValue(undefined)
    renderHook(() => useYoutube({ handleSendChat }))

    await flushAsync()

    expect(mockUseOneComme).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: true,
        port: 11180,
      })
    )
    expect(mockFetchAndProcessComments).toHaveBeenCalledWith(handleSendChat, [])

    latestOneCommeParams?.commentBufferRef.current.push({
      userName: 'viewer',
      userIconUrl: '',
      userComment: 'コメントです',
    })

    await act(async () => {
      jest.advanceTimersByTime(5000)
      await Promise.resolve()
    })

    expect(mockFetchAndProcessComments).toHaveBeenLastCalledWith(
      handleSendChat,
      [
        {
          userName: 'viewer',
          userIconUrl: '',
          userComment: 'コメントです',
        },
      ]
    )
    expect(latestOneCommeParams?.commentBufferRef.current).toEqual([])
  })

  it('pauses comment processing while the character is speaking and resumes later', async () => {
    setupHomeState({ isSpeaking: true })
    const handleSendChat = jest.fn().mockResolvedValue(undefined)
    renderHook(() => useYoutube({ handleSendChat }))

    await flushAsync()
    expect(mockFetchAndProcessComments).not.toHaveBeenCalled()

    latestOneCommeParams?.commentBufferRef.current.push({
      userName: 'viewer',
      userIconUrl: '',
      userComment: '実況中のコメント',
    })

    await act(async () => {
      jest.advanceTimersByTime(5000)
      await Promise.resolve()
    })

    expect(mockFetchAndProcessComments).not.toHaveBeenCalled()

    mockHomeState = {
      ...mockHomeState,
      isSpeaking: false,
    }

    await act(async () => {
      jest.advanceTimersByTime(5000)
      await Promise.resolve()
    })

    expect(mockFetchAndProcessComments).toHaveBeenCalledWith(handleSendChat, [
      {
        userName: 'viewer',
        userIconUrl: '',
        userComment: '実況中のコメント',
      },
    ])
  })

  it('stops polling and resets YouTube state when playback is turned off', async () => {
    const handleSendChat = jest.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(() => useYoutube({ handleSendChat }))

    await flushAsync()
    expect(mockFetchAndProcessComments).toHaveBeenCalledTimes(1)

    mockSettingsState = {
      ...mockSettingsState,
      youtubePlaying: false,
    }
    rerender()

    expect(mockResetYoutubeState).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(15000)
      await Promise.resolve()
    })

    expect(mockFetchAndProcessComments).toHaveBeenCalledTimes(1)
    expect(mockUseOneComme).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: false,
      })
    )
  })
})
