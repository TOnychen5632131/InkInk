import axios from 'axios'

const API_BASE_URL = '/api'

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}`
}

export interface Page {
  index: number
  type: 'cover' | 'content' | 'summary'
  content: string
}

export interface OutlineResponse {
  success: boolean
  outline?: string
  pages?: Page[]
  error?: string
}

export interface ProgressEvent {
  index: number
  status: 'generating' | 'done' | 'error'
  current?: number
  total?: number
  image_url?: string
  message?: string
}

export interface FinishEvent {
  success: boolean
  task_id: string
  images: string[]
}

// 生成大纲（支持图片上传）
export async function generateOutline(
  topic: string,
  images?: File[]
): Promise<OutlineResponse & { has_images?: boolean }> {
  let imagesBase64: string[] | undefined = undefined
  if (images && images.length > 0) {
    imagesBase64 = await Promise.all(
      images.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
      )
    )
  }

  const response = await axios.post<OutlineResponse & { has_images?: boolean }>(
    `${API_BASE_URL}/generateText`,
    {
      topic,
      images: imagesBase64
    }
  )
  const data = response.data
  if ((!data.pages || data.pages.length === 0) && data.outline) {
    const lines = data.outline
      .split(/\n+/)
      .map(l => l.trim())
      .filter(Boolean)
    const pages: Page[] = lines.map((text, idx) => ({
      index: idx,
      type: idx === 0 ? 'cover' : (idx === lines.length - 1 ? 'summary' : 'content'),
      content: text
    }))
    data.pages = pages
  }
  return data
}

// 获取图片 URL（新格式：task_id/filename）
// thumbnail 参数：true=缩略图（默认），false=原图
export function getImageUrl(taskId: string, filename: string, thumbnail: boolean = true): string {
  // 前端直接使用完整 URL 或 data URL；这里保留兼容形式
  return filename
}

// 重新生成图片（即使成功的也可以重新生成）
export async function regenerateImage(
  taskId: string,
  page: Page,
  useReference: boolean = true,
  context?: {
    fullOutline?: string
    userTopic?: string
  }
): Promise<{ success: boolean; index: number; image_url?: string; error?: string }> {
  // 直接调用生成接口
  const result = await axios.post(`${API_BASE_URL}/generateImage`, {
    prompt: page.content,
    aspect_ratio: '1:1',
    user_topic: context?.userTopic
  })
  const data = result.data
  if (data.success) {
    return { success: true, index: page.index, image_url: data.image_url || data.image_base64 }
  }
  return { success: false, index: page.index, error: data.error || '生成失败' }
}

// 批量重试失败的图片（SSE）
export async function retryFailedImages(
  taskId: string,
  pages: Page[],
  onProgress: (event: ProgressEvent) => void,
  onComplete: (event: ProgressEvent) => void,
  onError: (event: ProgressEvent) => void,
  onFinish: (event: { success: boolean; total: number; completed: number; failed: number }) => void,
  onStreamError: (error: Error) => void
) {
  try {
    const response = await fetch(`${API_BASE_URL}/retry-failed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id: taskId,
        pages
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        const [eventLine, dataLine] = line.split('\n')
        if (!eventLine || !dataLine) continue

        const eventType = eventLine.replace('event: ', '').trim()
        const eventData = dataLine.replace('data: ', '').trim()

        try {
          const data = JSON.parse(eventData)

          switch (eventType) {
            case 'retry_start':
              onProgress({ index: -1, status: 'generating', message: data.message })
              break
            case 'complete':
              onComplete(data)
              break
            case 'error':
              onError(data)
              break
            case 'retry_finish':
              onFinish(data)
              break
          }
        } catch (e) {
          console.error('解析 SSE 数据失败:', e)
        }
      }
    }
  } catch (error) {
    onStreamError(error as Error)
  }
}

// ==================== 历史记录相关 API ====================

export interface HistoryRecord {
  id: string
  title: string
  created_at: string
  updated_at: string
  status: string
  thumbnail: string | null
  page_count: number
  task_id: string | null
}

export interface HistoryDetail {
  id: string
  title: string
  created_at: string
  updated_at: string
  outline: {
    raw: string
    pages: Page[]
  }
  images: {
    task_id: string | null
    generated: string[]
  }
  status: string
  thumbnail: string | null
}

// 创建历史记录
export async function createHistory(
  topic: string,
  outline: { raw: string; pages: Page[] },
  taskId?: string
): Promise<{ success: boolean; record_id?: string; error?: string }> {
  const key = 'inkink-history'
  const saved = JSON.parse(localStorage.getItem(key) || '[]')
  const record_id = randomId('record')
  const now = new Date().toISOString()
  saved.unshift({
    id: record_id,
    title: topic,
    created_at: now,
    updated_at: now,
    outline,
    status: 'completed',
    images: { task_id: taskId || null, generated: [] },
    thumbnail: null,
    page_count: outline.pages.length
  })
  localStorage.setItem(key, JSON.stringify(saved))
  return { success: true, record_id }
}

// 获取历史记录列表
export async function getHistoryList(
  page: number = 1,
  pageSize: number = 20,
  status?: string
): Promise<{
  success: boolean
  records: HistoryRecord[]
  total: number
  page: number
  page_size: number
  total_pages: number
}> {
  const key = 'inkink-history'
  const saved: any[] = JSON.parse(localStorage.getItem(key) || '[]')
  let records = saved
  if (status) {
    records = records.filter(r => r.status === status)
  }
  const start = (page - 1) * pageSize
  const paged = records.slice(start, start + pageSize)
  return {
    success: true,
    records: paged,
    total: records.length,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(records.length / pageSize)
  }
}

// 获取历史记录详情
export async function getHistory(recordId: string): Promise<{
  success: boolean
  record?: HistoryDetail
  error?: string
}> {
  const key = 'inkink-history'
  const saved: any[] = JSON.parse(localStorage.getItem(key) || '[]')
  const record = saved.find(r => r.id === recordId)
  if (!record) return { success: false, error: '未找到记录' }
  return { success: true, record }
}

// 更新历史记录
export async function updateHistory(
  recordId: string,
  data: {
    outline?: { raw: string; pages: Page[] }
    images?: { task_id: string | null; generated: string[] }
    status?: string
    thumbnail?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const key = 'inkink-history'
  const saved: any[] = JSON.parse(localStorage.getItem(key) || '[]')
  const idx = saved.findIndex(r => r.id === recordId)
  if (idx === -1) return { success: false, error: '未找到记录' }
  const now = new Date().toISOString()
  saved[idx] = {
    ...saved[idx],
    ...data,
    updated_at: now
  }
  localStorage.setItem(key, JSON.stringify(saved))
  return { success: true }
}

// 删除历史记录
export async function deleteHistory(recordId: string): Promise<{
  success: boolean
  error?: string
}> {
  const key = 'inkink-history'
  const saved: any[] = JSON.parse(localStorage.getItem(key) || '[]')
  const filtered = saved.filter(r => r.id !== recordId)
  localStorage.setItem(key, JSON.stringify(filtered))
  return { success: true }
}

// 搜索历史记录
export async function searchHistory(keyword: string): Promise<{
  success: boolean
  records: HistoryRecord[]
}> {
  const key = 'inkink-history'
  const saved: any[] = JSON.parse(localStorage.getItem(key) || '[]')
  const lower = keyword.toLowerCase()
  const records = saved.filter((r) => r.title?.toLowerCase().includes(lower))
  return { success: true, records }
}

// 获取统计信息
export async function getHistoryStats(): Promise<{
  success: boolean
  total: number
  by_status: Record<string, number>
}> {
  const key = 'inkink-history'
  const saved: any[] = JSON.parse(localStorage.getItem(key) || '[]')
  const by_status: Record<string, number> = {}
  saved.forEach((r) => {
    by_status[r.status] = (by_status[r.status] || 0) + 1
  })
  return { success: true, total: saved.length, by_status }
}

// 使用 POST 方式生成图片（更可靠）
export async function generateImagesPost(
  pages: Page[],
  taskId: string | null,
  fullOutline: string,
  onProgress: (event: ProgressEvent) => void,
  onComplete: (event: ProgressEvent) => void,
  onError: (event: ProgressEvent) => void,
  onFinish: (event: FinishEvent) => void,
  onStreamError: (error: Error) => void,
  userImages?: File[],
  userTopic?: string
) {
  try {
    const task = taskId || randomId('task')
    let userImagesBase64: string[] = []
    if (userImages && userImages.length > 0) {
      userImagesBase64 = await Promise.all(
        userImages.map(file => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        })
      )
    }

    let completed: string[] = []
    for (const page of pages) {
      onProgress({ index: page.index, status: 'generating', current: completed.length + 1, total: pages.length })
      try {
        const res = await axios.post(`${API_BASE_URL}/generateImage`, {
          prompt: page.content,
          aspect_ratio: '1:1',
          user_topic: userTopic,
          user_images: userImagesBase64,
          page_type: page.type,
          full_outline: fullOutline
        })
        const data = res.data
        if (data.success) {
          const url = data.image_url || (data.image_base64 ? `data:image/png;base64,${data.image_base64}` : '')
          completed.push(url)
          onComplete({ index: page.index, status: 'done', image_url: url })
        } else {
          onError({ index: page.index, status: 'error', message: data.error || '生成失败' })
        }
      } catch (err: any) {
        onError({ index: page.index, status: 'error', message: err?.message || '生成失败' })
      }
    }

    onFinish({ success: true, task_id: task, images: completed })
  } catch (error) {
    onStreamError(error as Error)
  }
}

// 扫描所有任务并同步图片列表
export async function scanAllTasks(): Promise<{
  success: boolean
  total_tasks?: number
  synced?: number
  failed?: number
  orphan_tasks?: string[]
  results?: any[]
  error?: string
}> {
  return { success: true, total_tasks: 0, synced: 0, failed: 0, orphan_tasks: [] }
}

// ==================== 配置管理 API ====================

export interface Config {
  text_generation: {
    active_provider: string
    providers: Record<string, any>
  }
  image_generation: {
    active_provider: string
    providers: Record<string, any>
  }
}

// 获取配置
export async function getConfig(): Promise<{
  success: boolean
  config?: Config
  error?: string
}> {
  const response = await axios.get(`${API_BASE_URL}/config`)
  return response.data
}

// 更新配置
export async function updateConfig(config: Partial<Config>): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  const response = await axios.post(`${API_BASE_URL}/config`, config)
  return response.data
}

// 测试服务商连接
export async function testConnection(config: {
  type: string
  provider_name?: string
  api_key?: string
  base_url?: string
  model: string
}): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  const response = await axios.post(`${API_BASE_URL}/config/test`, config)
  return response.data
}
