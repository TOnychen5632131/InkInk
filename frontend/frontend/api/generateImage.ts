export const runtime = 'edge'

import OpenAI from 'openai'

function extractBase64(message: any): string | null {
  const multi = message?.multi_mod_content || message?.multi_modal_content
  if (Array.isArray(multi)) {
    for (const part of multi) {
      const inline = part?.inline_data || part?.inlineData
      if (inline?.data) return inline.data
    }
  }

  const content = message?.content
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'image_url' && part?.image_url?.url) {
        const url = part.image_url.url as string
        if (url.startsWith('data:image')) return url.split(',')[1]
      }
      const inline = part?.inline_data || part?.inlineData
      if (inline?.data) return inline.data
    }
  }

  if (typeof content === 'string') {
    if (content.startsWith('data:image')) return content.split(',')[1]
  }
  return null
}

export default async function handler(req: Request) {
  try {
    const body = await req.json()
    const prompt: string = body?.prompt || ''
    const images: string[] | undefined = body?.user_images

    if (!process.env.AI_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'AI_API_KEY 未配置' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }

    const client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL || 'https://aihubmix.com/v1'
    })

    const parts: any[] = [{ type: 'text', text: prompt }]
    if (Array.isArray(images)) {
      images.forEach((img) => {
        parts.push({ type: 'image_url', image_url: { url: img } })
      })
    }

    const completion = await client.chat.completions.create({
      model: process.env.AI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview',
      messages: [{ role: 'user', content: parts }],
      modalities: ['text', 'image'],
      temperature: body?.temperature ?? 0.7
    })

    const message = completion.choices?.[0]?.message
    const b64 = extractBase64(message)
    if (!b64) {
      return new Response(JSON.stringify({ success: false, error: '未获取到图片数据' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, image_base64: b64 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || '生成失败' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
}
