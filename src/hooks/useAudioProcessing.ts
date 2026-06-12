import { useEffect, useState, useCallback, useRef } from 'react'
import toastStore from '@/features/stores/toast'
import { useTranslation } from 'react-i18next'

// AudioContext の型定義を拡張
type AudioContextType = typeof AudioContext

/**
 * オーディオ処理のためのカスタムフック
 * 録音機能とオーディオバッファの管理を担当
 */
export function useAudioProcessing() {
  const { t } = useTranslation()
  const audioContextRef = useRef<AudioContext | null>(null)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // AudioContextの遅延初期化（初回利用時に生成）
  // マウント時に生成すると、オーディオデバイスが初期化できない環境で
  // new AudioContext() がネイティブ層でハングしメインスレッドをブロックするため、
  // ユーザー操作起点の処理（decodeAudioData等）で必要になるまで生成しない
  const getAudioContext = useCallback((): AudioContext | null => {
    if (!audioContextRef.current) {
      const AudioContextClass = (window.AudioContext ||
        (window as any).webkitAudioContext) as AudioContextType
      if (!AudioContextClass) return null
      audioContextRef.current = new AudioContextClass()
    }
    return audioContextRef.current
  }, [])

  // AudioContextのクリーンアップ（アンマウント時のみ）
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error)
        audioContextRef.current = null
      }
    }
  }, []) // 空の依存配列でマウント時のみ実行

  // MediaRecorderのクリーンアップ（mediaRecorderの状態変化時）
  useEffect(() => {
    return () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }
  }, [mediaRecorder])

  /**
   * マイク権限を確認する関数
   */
  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch (error) {
      // 統一されたエラーハンドリングパターン (Requirement 8)
      console.error('Microphone permission error:', error)
      toastStore.getState().addToast({
        message: t('Toasts.MicrophonePermissionDenied'),
        type: 'error',
        tag: 'microphone-permission-error',
      })
      return false
    }
  }

  /**
   * メディアレコーダーを開始する関数
   * @param options - MediaRecorderのオプション
   */
  const startRecording = useCallback(
    async (options?: MediaRecorderOptions): Promise<boolean> => {
      try {
        const hasPermission = await checkMicrophonePermission()
        if (!hasPermission) return false

        // 既存のレコーダーを停止
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop()
        }

        // オーディオチャンクをリセット
        audioChunksRef.current = []

        // オーディオストリームを取得
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        })

        // MediaRecorderでサポートされているmimeTypeを確認
        // Whisper APIがサポートする形式を考慮し、実際にブラウザでサポートされる形式を優先
        const mimeTypes = [
          'audio/webm;codecs=opus', // Chrome/Edge で広くサポート
          'audio/webm', // Chrome/Edge フォールバック
          'audio/mp4', // Safari
          'audio/ogg', // Firefox
          'audio/wav', // 汎用
          'audio/mpeg',
          'audio/mp3', // フォールバック（ほぼサポートされない）
        ]

        let selectedMimeType = 'audio/webm'
        for (const type of mimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type
            break // 優先順位順なので最初に見つかったものを使用
          }
        }

        console.log(`Using MIME type: ${selectedMimeType} for recording`)

        // デフォルトのオプションをマージ
        const recorderOptions = {
          mimeType: selectedMimeType,
          audioBitsPerSecond: 128000,
          ...options,
        }

        // レコーダーを作成
        const recorder = new MediaRecorder(stream, recorderOptions)

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
            console.log(
              'Recording: added chunk, size:',
              event.data.size,
              'type:',
              event.data.type
            )
          }
        }

        setMediaRecorder(recorder)
        recorder.start(100) // 100msごとにデータ収集
        return true
      } catch (error) {
        // 統一されたエラーハンドリングパターン (Requirement 8)
        console.error('Error starting recording:', error)
        toastStore.getState().addToast({
          message: t('Toasts.SpeechRecognitionError'),
          type: 'error',
          tag: 'speech-recognition-error',
        })
        return false
      }
    },
    [mediaRecorder, t]
  )

  /**
   * 録音を停止し、録音データを取得する関数
   */
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      console.log('🔴 MediaRecorder停止: すでに非アクティブ状態です')
      return null
    }

    console.log('🎤 MediaRecorder停止開始: 現在の状態:', mediaRecorder.state)

    // 重要: 先にトラックを停止すると、残りのデータが失われる可能性がある
    // そのため、まずMediaRecorderを停止し、すべてのデータを収集してから
    // トラックを停止する順序が重要

    return new Promise<Blob | null>((resolve) => {
      // 現在のチャンクを保持
      const currentChunks = [...audioChunksRef.current]
      console.log(`🎤 停止前のチャンク数: ${currentChunks.length}`)

      // ondataavailableイベントは停止後にも発火する可能性がある
      const oldDataAvailableHandler = mediaRecorder.ondataavailable
      mediaRecorder.ondataavailable = (event) => {
        // 元のハンドラも呼び出す
        if (oldDataAvailableHandler)
          oldDataAvailableHandler.call(mediaRecorder, event)

        if (event.data.size > 0) {
          currentChunks.push(event.data)
          console.log(
            `🎤 停止処理中に新しいチャンクを追加: サイズ=${event.data.size}, 合計=${currentChunks.length}`
          )
        }
      }

      // onstopハンドラを設定
      mediaRecorder.onstop = () => {
        console.log(
          `🎤 MediaRecorder停止完了イベント発生: チャンク数=${currentChunks.length}`
        )

        let audioBlob = null
        if (currentChunks.length > 0) {
          // 保存されたMIMEタイプを取得
          let blobType = 'audio/webm'
          if (mediaRecorder.mimeType && mediaRecorder.mimeType !== '') {
            blobType = mediaRecorder.mimeType
          }

          // 音声チャンクをマージしてBlobに変換
          audioBlob = new Blob(currentChunks, { type: blobType })
          console.log(
            `🎤 音声Blobを作成: サイズ=${audioBlob.size}バイト, タイプ=${blobType}`
          )
        } else {
          console.log('🔴 録音データなし: チャンクは収集されませんでした')
        }

        // mediaRecorderのストリームを停止
        try {
          if (mediaRecorder.stream) {
            console.log('🎤 オーディオストリームのトラックを停止します')
            mediaRecorder.stream.getTracks().forEach((track) => {
              track.stop()
              console.log(
                `🎤 オーディオトラック停止: ID=${track.id}, 種類=${track.kind}`
              )
            })
          }
        } catch (trackError) {
          console.error('🔴 トラック停止エラー:', trackError)
        }

        // グローバルなオーディオチャンク配列をクリア
        audioChunksRef.current = []
        console.log('🎤 グローバルオーディオチャンク配列をクリア')

        // 結果を返す
        resolve(audioBlob)
      }

      // stopメソッドを呼び出す
      try {
        mediaRecorder.stop()
        console.log('🎤 MediaRecorder.stop()メソッド呼び出し成功')
      } catch (error) {
        console.error('🔴 MediaRecorder.stop()エラー:', error)

        // エラーが発生した場合でも、ストリームを停止し、現在のチャンクでBlobを作成
        try {
          if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach((track) => track.stop())
          }
        } catch (trackError) {
          console.error('🔴 エラー発生後のトラック停止エラー:', trackError)
        }

        // 現在のチャンクでBlobを作成
        let audioBlob = null
        if (currentChunks.length > 0) {
          audioBlob = new Blob(currentChunks, { type: 'audio/webm' })
        }

        // グローバルなオーディオチャンク配列をクリア
        audioChunksRef.current = []

        // 結果を返す
        resolve(audioBlob)
      }
    })
  }, [mediaRecorder])

  /**
   * AudioBuffer をデコードする関数
   */
  const decodeAudioData = useCallback(
    async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer | null> => {
      const audioContext = getAudioContext()
      if (!audioContext) return null

      try {
        return await audioContext.decodeAudioData(arrayBuffer)
      } catch (error) {
        console.error('Failed to decode audio data:', error)
        return null
      }
    },
    [getAudioContext]
  )

  return {
    getAudioContext,
    mediaRecorder,
    audioChunksRef,
    checkMicrophonePermission,
    startRecording,
    stopRecording,
    decodeAudioData,
  }
}
