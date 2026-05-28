import CircuitBreaker from 'opossum'
import { env, FIRECRAWL_URL } from '../config/env'

export interface FirecrawlSearchOptions {
  query: string
  limit?: number
  scrapeOptions?: {
    formats: string[]
    onlyMainContent?: boolean
    waitFor?: number
  }
}

export interface FirecrawlScrapeOptions {
  url: string
  formats?: string[]
  onlyMainContent?: boolean
  waitFor?: number
  actions?: FirecrawlAction[]
}

export interface FirecrawlCrawlOptions {
  url: string
  limit?: number
  scrapeOptions?: FirecrawlScrapeOptions
  includePaths?: string[]
  excludePaths?: string[]
}

export interface FirecrawlMapOptions {
  url: string
  limit?: number
  search?: string
}

export interface FirecrawlAgentOptions {
  prompt: string
  schema?: Record<string, unknown>
}

export interface FirecrawlInteractOptions {
  url: string
  prompt: string
  actions?: FirecrawlAction[]
  schema?: Record<string, unknown>
}

export interface FirecrawlAction {
  type: 'click' | 'type' | 'scroll' | 'wait' | 'screenshot'
  selector?: string
  text?: string
  timeout?: number
}

export interface FirecrawlSearchResult {
  title?: string
  url?: string
  description?: string
  markdown?: string
  rawHtml?: string
  links?: string[]
  metadata?: Record<string, unknown>
}

export interface FirecrawlSearchResponse {
  success: boolean
  data: {
    web: FirecrawlSearchResult[]
  }
  warning?: string
}

export interface FirecrawlScrapeResponse {
  success: boolean
  code?: string
  error?: string
  data: {
    markdown?: string
    html?: string
    rawHtml?: string
    links?: string[]
    screenshot?: string
    metadata?: {
      title?: string
      description?: string
      language?: string
      sourceURL?: string
      statusCode?: number
      pageError?: string
      error?: string
      [key: string]: unknown
    }
    actions?: Record<string, unknown>
    llm_extraction?: Record<string, unknown>
  }
  warning?: string
}

export interface FirecrawlCrawlResponse {
  success: boolean
  id?: string
  status?: 'running' | 'completed' | 'failed'
  data?: FirecrawlScrapeResponse['data'][]
  total?: number
  completed?: number
  warning?: string
}

export interface FirecrawlMapResponse {
  success: boolean
  links?: string[]
  warning?: string
}

export interface FirecrawlAgentResponse {
  success: boolean
  data?: {
    markdown?: string
    extracted?: Record<string, unknown>
    steps?: Array<{
      action: string
      result: string
    }>
    llm_extraction?: Record<string, unknown>
  }
  warning?: string
}

export interface FirecrawlInteractResponse {
  success: boolean
  data?: {
    markdown?: string
    extracted?: Record<string, unknown>
    screenshots?: string[]
  }
  warning?: string
}

export interface FirecrawlBatchScrapeInput {
  urls: string[]
  formats?: string[]
  onlyMainContent?: boolean
  waitFor?: number
}

export interface FirecrawlBatchScrapeResponse {
  success: boolean
  id?: string
  url?: string
  status?: 'running' | 'completed' | 'failed'
  data?: Array<{
    url?: string
    markdown?: string
    metadata?: { title?: string; statusCode?: number; [key: string]: unknown }
  }>
  invalidURLs?: string[]
  warning?: string
}

const RETRY_COUNT = env.FIRECRAWL_RETRY_COUNT
const TIMEOUT_MS = env.FIRECRAWL_TIMEOUT_MS
const BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: TIMEOUT_MS,
  errorThresholdPercentage: 80,
  resetTimeout: 30000,
  volumeThreshold: 3,
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'ComfHutt-CRUX/1.0 (Property Intelligence Engine)',
  }
}

async function retryFetch(
  url: string,
  options: RequestInit,
  retries: number = RETRY_COUNT,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (attempt === retries) throw error
      const waitMs = 1000 * Math.pow(2, attempt)
      console.warn(`[firecrawl] attempt ${attempt + 1} failed, retrying in ${waitMs}ms: ${(error as Error)?.message ?? 'unknown'}`)
      await delay(waitMs)
    }
  }
  throw new Error('FIRECRAWL_MAX_RETRIES_EXCEEDED')
}

async function fireRequest<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await retryFetch(`${FIRECRAWL_URL}${endpoint}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`FIRECRAWL_HTTP_${response.status}: ${text.slice(0, 200)}`)
  }

  const json = (await response.json()) as T
  return json
}

export class FirecrawlClient {
  async search(
    query: string,
    options?: Omit<FirecrawlSearchOptions, 'query'>,
  ): Promise<FirecrawlSearchResponse> {
    return fireRequest<FirecrawlSearchResponse>('/v2/search', {
      query,
      limit: options?.limit ?? 10,
      scrapeOptions: options?.scrapeOptions ?? {
        formats: ['markdown'],
        onlyMainContent: false,
      },
    })
  }

  async scrape(
    url: string,
    options?: Omit<FirecrawlScrapeOptions, 'url'>,
  ): Promise<FirecrawlScrapeResponse> {
    return fireRequest<FirecrawlScrapeResponse>('/v2/scrape', {
      url,
      formats: options?.formats ?? ['markdown'],
      onlyMainContent: options?.onlyMainContent ?? true,
      waitFor: options?.waitFor,
      actions: options?.actions,
    })
  }

  async crawl(
    url: string,
    options?: Omit<FirecrawlCrawlOptions, 'url'>,
  ): Promise<FirecrawlCrawlResponse> {
    return fireRequest<FirecrawlCrawlResponse>('/v2/crawl', {
      url,
      limit: options?.limit ?? 15,
      scrapeOptions: options?.scrapeOptions ?? {
        formats: ['markdown'],
        onlyMainContent: false,
      },
      includePaths: options?.includePaths,
      excludePaths: options?.excludePaths,
    })
  }

  async map(
    url: string,
    options?: Omit<FirecrawlMapOptions, 'url'>,
  ): Promise<FirecrawlMapResponse> {
    return fireRequest<FirecrawlMapResponse>('/v2/map', {
      url,
      limit: options?.limit ?? 100,
      search: options?.search,
    })
  }

  async agent(
    prompt: string,
    options?: Omit<FirecrawlAgentOptions, 'prompt'>,
  ): Promise<FirecrawlAgentResponse> {
    return fireRequest<FirecrawlAgentResponse>('/v2/agent', {
      prompt,
      schema: options?.schema,
    })
  }

  async interact(
    url: string,
    prompt: string,
    options?: Omit<FirecrawlInteractOptions, 'url' | 'prompt'>,
  ): Promise<FirecrawlInteractResponse> {
    return fireRequest<FirecrawlInteractResponse>('/v2/interact', {
      url,
      prompt,
      actions: options?.actions,
      schema: options?.schema,
    })
  }

  async batchScrape(
    urls: string[],
    options?: Omit<FirecrawlBatchScrapeInput, 'urls'>,
  ): Promise<FirecrawlBatchScrapeResponse> {
    const startResult = await fireRequest<FirecrawlBatchScrapeResponse>('/v2/batch/scrape', {
      urls,
      formats: options?.formats ?? ['markdown'],
      onlyMainContent: options?.onlyMainContent ?? false,
      waitFor: options?.waitFor,
    })

    if (!startResult.success || !startResult.id) {
      return { success: false }
    }

    const batchId = startResult.id

    for (let i = 0; i < 20; i++) {
      await delay(2000)
      const statusResult = await fireRequest<FirecrawlBatchScrapeResponse>(`/v2/batch/scrape/${batchId}`, {})
      if (statusResult.status === 'completed') return statusResult
      if (statusResult.status === 'failed') return { success: false }
    }

    return { success: false }
  }
}

function createBreaker<T>(
  name: string,
  fn: (...args: unknown[]) => Promise<T>,
): CircuitBreaker {
  const breaker = new CircuitBreaker(fn, BREAKER_OPTIONS)
  breaker.on('open', () => console.warn(`[firecrawl] circuit breaker OPEN for ${name}`))
  breaker.on('halfOpen', () => console.log(`[firecrawl] circuit breaker HALF-OPEN for ${name}`))
  breaker.on('close', () => console.log(`[firecrawl] circuit breaker CLOSED for ${name}`))
  return breaker
}

export const firecrawlClient = new FirecrawlClient()

export const firecrawlSearchBreaker = createBreaker<FirecrawlSearchResponse>(
  'search',
  async (...args: unknown[]) =>
    firecrawlClient.search(args[0] as string, args[1] as Omit<FirecrawlSearchOptions, 'query'> | undefined),
)

export const firecrawlScrapeBreaker = createBreaker<FirecrawlScrapeResponse>(
  'scrape',
  async (...args: unknown[]) =>
    firecrawlClient.scrape(args[0] as string, args[1] as Omit<FirecrawlScrapeOptions, 'url'> | undefined),
)

export const firecrawlCrawlBreaker = createBreaker<FirecrawlCrawlResponse>(
  'crawl',
  async (...args: unknown[]) =>
    firecrawlClient.crawl(args[0] as string, args[1] as Omit<FirecrawlCrawlOptions, 'url'> | undefined),
)

export const firecrawlMapBreaker = createBreaker<FirecrawlMapResponse>(
  'map',
  async (...args: unknown[]) =>
    firecrawlClient.map(args[0] as string, args[1] as Omit<FirecrawlMapOptions, 'url'> | undefined),
)

export const firecrawlAgentBreaker = createBreaker<FirecrawlAgentResponse>(
  'agent',
  async (...args: unknown[]) =>
    firecrawlClient.agent(args[0] as string, args[1] as Omit<FirecrawlAgentOptions, 'prompt'> | undefined),
)

export const firecrawlInteractBreaker = createBreaker<FirecrawlInteractResponse>(
  'interact',
  async (...args: unknown[]) =>
    firecrawlClient.interact(
      args[0] as string,
      args[1] as string,
      args[2] as Omit<FirecrawlInteractOptions, 'url' | 'prompt'> | undefined,
    ),
)