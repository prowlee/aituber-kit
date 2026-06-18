import { getAIChatResponseStream } from '@/features/chat/aiChatFactory'
import { THINKING_MARKER } from '@/features/chat/vercelAIChat'
import { Message } from '@/features/messages/messages'
import settingsStore from '@/features/stores/settings'

export function normalizeGameCommentarySceneAnalysis(rawText: string): string {
  const normalized = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n')
    .trim()

  return normalized.slice(0, 200).trim()
}

export async function analyzeGameCommentaryScene(
  imageData: string
): Promise<string | null> {
  const ss = settingsStore.getState()
  const systemPrompt =
    ss.gameCommentaryBackgroundAnalysisPromptTemplate ||
    `あなたはゲーム実況の補助解析器です。
実況のセリフや感情表現は不要です。
画像から次の実況生成に必要な事実だけを、日本語で簡潔に返してください。

ルール:
- 1〜3行で返す
- 画面中央の出来事、UIやゲージ、プレイヤーや敵の位置や状態、直後の判断に効く情報を優先
- 分からないことは推測しない
- 変化が乏しい静的な場面なら「大きな変化なし」とだけ返してよい`

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'この1枚の画面から、実況補助用の事実メモだけを返してください。',
        },
        { type: 'image', image: imageData },
      ],
    },
  ]

  try {
    const stream = await getAIChatResponseStream(messages)
    if (!stream) return null

    const reader = stream.getReader()
    let fullText = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && !value.startsWith(THINKING_MARKER)) {
          fullText += value
        }
      }
    } finally {
      reader.releaseLock()
    }

    const normalized = normalizeGameCommentarySceneAnalysis(fullText)
    return normalized || null
  } catch (error) {
    console.error('ゲーム実況シーン解析エラー:', error)
    return null
  }
}
