/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { useOneComme } from '@/features/youtube/useOneComme'
import { YouTubeComment } from '@/features/youtube/youtubeComments'

describe('useOneComme', () => {
  let subscribedCallback: ((data: unknown) => void) | undefined
  let appendChildSpy: jest.SpyInstance

  beforeEach(() => {
    subscribedCallback = undefined
    appendChildSpy = jest
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node: Node) => {
        setTimeout(() => {
          const script = node as HTMLScriptElement
          window.OneSDK = {
            setup: jest.fn(),
            ready: jest.fn().mockResolvedValue(undefined),
            connect: jest.fn().mockResolvedValue(undefined),
            subscribe: jest.fn(({ callback }) => {
              subscribedCallback = callback
            }),
          }
          script.onload?.(new Event('load'))
        }, 0)
        return node
      })
  })

  afterEach(() => {
    appendChildSpy.mockRestore()
    window.OneSDK = undefined
    document.head
      .querySelectorAll('script')
      .forEach((script) => script.remove())
  })

  it('buffers valid comments and ignores hash-prefixed or duplicate comments', async () => {
    const commentBufferRef = {
      current: [] as YouTubeComment[],
    }

    const { result } = renderHook(() =>
      useOneComme({
        enabled: true,
        port: 11180,
        commentBufferRef,
      })
    )

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })
    expect(subscribedCallback).toBeDefined()

    act(() => {
      subscribedCallback?.([
        {
          data: {
            id: 'comment-1',
            comment: 'こんにちは',
            nickname: 'viewer-a',
            profileImage: 'icon-a.png',
          },
        },
        {
          data: {
            id: 'comment-2',
            comment: '#bot-command',
            nickname: 'viewer-b',
          },
        },
        {
          data: {
            id: 'comment-1',
            comment: 'duplicate',
            nickname: 'viewer-a',
          },
        },
        {
          data: {
            id: 'comment-3',
            message: 'message field comment',
            author: {
              name: 'viewer-c',
              profileImage: 'icon-c.png',
            },
          },
        },
      ])
    })

    expect(commentBufferRef.current).toEqual([
      {
        userName: 'viewer-a',
        userIconUrl: 'icon-a.png',
        userComment: 'こんにちは',
      },
      {
        userName: 'viewer-c',
        userIconUrl: 'icon-c.png',
        userComment: 'message field comment',
      },
    ])
  })

  it('does not connect while disabled', () => {
    const commentBufferRef = {
      current: [] as YouTubeComment[],
    }

    const { result } = renderHook(() =>
      useOneComme({
        enabled: false,
        port: 11180,
        commentBufferRef,
      })
    )

    expect(result.current).toEqual({
      isConnected: false,
      isLoading: false,
      error: null,
    })
    expect(appendChildSpy).not.toHaveBeenCalled()
  })
})
