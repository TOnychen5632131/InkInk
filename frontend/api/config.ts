function maskKey(key?: string | null) {
  if (!key) return ''
  const prefix = key.slice(0, 4)
  const suffix = key.slice(-4)
  return `${prefix}****${suffix}`
}

function buildConfig() {
  const textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  return {
    text_generation: {
      active_provider: 'openai',
      providers: {
        openai: {
          type: 'openai_compatible',
          model: textModel,
          base_url: baseUrl,
          api_key_masked: maskKey(process.env.OPENAI_API_KEY)
        }
      }
    },
    image_generation: {
      active_provider: 'openai_image',
      providers: {
        openai_image: {
          type: 'image_api',
          model: imageModel,
          base_url: baseUrl,
          api_key_masked: maskKey(process.env.OPENAI_API_KEY)
        }
      }
    }
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, config: buildConfig() })
  }

  if (req.method === 'POST') {
    // 这里不做持久化，直接回显成功结果
    return res.status(200).json({ success: true, message: '配置已保存（当前会话）', config: buildConfig() })
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' })
}
