// @ts-nocheck
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
})

function maskKey(key?: string | null) {
  if (!key) return ''
  const prefix = key.slice(0, 4)
  const suffix = key.slice(-4)
  return `${prefix}****${suffix}`
}

function buildPrompt(prompt: string, userTopic?: string, pageType?: string, fullOutline?: string) {
  const extras = []
  if (pageType) extras.push(`当前页面类型：${pageType}`)
  if (userTopic) extras.push(`用户主题：${userTopic}`)
  if (fullOutline) extras.push(`整体大纲：${fullOutline.slice(0, 500)}`)
  return `${prompt}\n${extras.join('\n')}`
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: '缺少 OPENAI_API_KEY 环境变量' })
  }

  const { prompt, aspect_ratio, user_topic, full_outline, page_type } = req.body || {}

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, error: '缺少 prompt' })
  }

  try {
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
    const size =
      aspect_ratio === '16:9'
        ? '1536x1024'
        : aspect_ratio === '3:4'
          ? '1024x1536'
          : '1024x1024'

    const response = await client.images.generate({
      model,
      prompt: buildPrompt(prompt, user_topic, page_type, full_outline),
      size,
      response_format: 'b64_json'
    })

    const base64 = response.data[0]?.b64_json

    if (!base64) {
      return res.status(500).json({ success: false, error: '生成失败，未返回图片' })
    }

    return res.status(200).json({
      success: true,
      image_base64: base64,
      image_url: `data:image/png;base64,${base64}`,
      provider: 'openai',
      model
    })
  } catch (error: any) {
    console.error('generateImage error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || '生成失败',
      provider: 'openai',
      api_key_masked: maskKey(process.env.OPENAI_API_KEY)
    })
  }
}
