export const runtime = 'edge'

import OpenAI from 'openai'

export default async function handler(req: Request) {
  try {
    const body = await req.json()
    const topic: string = body?.topic || ''
    const images: string[] | undefined = body?.images

    if (!process.env.AI_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'AI_API_KEY 未配置' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }

    const client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1'
    })

    const messages: any[] = [{ role: 'user', content: topic }]
    if (images?.length) {
      const contentParts: any[] = [{ type: 'text', text: topic }]
      images.forEach((img) => {
        contentParts.push({ type: 'image_url', image_url: { url: img } })
      })
      messages[0].content = contentParts
    }

    const completion = await client.chat.completions.create({
      model: process.env.AI_TEXT_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 1
    })

    const outline = completion.choices?.[0]?.message?.content || ''
    return new Response(JSON.stringify({ success: true, outline, pages: [], has_images: !!images?.length }), {
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
