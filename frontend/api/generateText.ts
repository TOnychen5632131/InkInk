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

function buildPages(outline: string) {
  const lines = outline
    .split(/\n+/)
    .map(line => line.replace(/^\d+[.)、]\s*/, '').trim())
    .filter(Boolean)

  return lines.map((text, idx) => ({
    index: idx,
    type: idx === 0 ? 'cover' : (idx === lines.length - 1 ? 'summary' : 'content'),
    content: text
  }))
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

  const { topic, images } = req.body || {}

  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ success: false, error: '缺少 topic' })
  }

  try {
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
    const imageHint = Array.isArray(images) && images.length > 0 ? '用户上传了参考图片，请在文案中体现风格一致性。' : '没有参考图片。'

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: '你是小红书图文助手，输出 6-9 行短句式大纲，每行一个要点。不要添加多余解释。'
        },
        {
          role: 'user',
          content: `主题：${topic}\n${imageHint}`
        }
      ]
    })

    const outline = completion.choices[0]?.message?.content?.trim() || ''
    const pages = buildPages(outline)

    return res.status(200).json({
      success: true,
      outline,
      pages,
      has_images: Array.isArray(images) && images.length > 0,
      provider: 'openai',
      model
    })
  } catch (error: any) {
    console.error('generateText error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || '生成失败',
      provider: 'openai',
      api_key_masked: maskKey(process.env.OPENAI_API_KEY)
    })
  }
}
