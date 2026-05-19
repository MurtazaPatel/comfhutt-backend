import { env } from '../../../config/env'
import type { PageContent, SearchResult } from '../shared/types'

export interface ResearchWebProvider {
  search(query: string, options?: { maxResults?: number }): Promise<SearchResult[]>
  fetchPage(url: string): Promise<PageContent>
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function createExcerpt(text: string, maxLength: number = 280): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

interface TavilyResultPayload {
  title?: unknown
  url?: unknown
  content?: unknown
  raw_content?: unknown
  score?: unknown
  published_date?: unknown
}

interface TavilyResponsePayload {
  results?: TavilyResultPayload[]
}

export class TavilyWebProvider implements ResearchWebProvider {
  async search(query: string, options?: { maxResults?: number }): Promise<SearchResult[]> {
    if (!env.TAVILY_API_KEY) {
      throw new Error('TAVILY_API_KEY_NOT_CONFIGURED')
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query,
        search_depth: 'advanced',
        include_raw_content: true,
        max_results: options?.maxResults ?? env.CRUX_RESEARCH_MAX_WEB_RESULTS,
      }),
    })

    if (!response.ok) {
      throw new Error(`TAVILY_HTTP_${response.status}`)
    }

    const payload = await response.json() as TavilyResponsePayload

    return (payload.results ?? []).map((result) => ({
      title: typeof result.title === 'string' ? result.title : 'Untitled source',
      url: typeof result.url === 'string' ? result.url : '',
      snippet: typeof result.content === 'string' ? result.content : '',
      raw_content: typeof result.raw_content === 'string' ? result.raw_content : null,
      score: typeof result.score === 'number' ? result.score : null,
      published_at: typeof result.published_date === 'string' ? result.published_date : null,
    })).filter((result) => Boolean(result.url))
  }

  async fetchPage(url: string): Promise<PageContent> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ComfHutt-CRUX/1.0 (Research Evidence Agent)',
      },
    })

    if (!response.ok) {
      throw new Error(`PAGE_FETCH_HTTP_${response.status}`)
    }

    const raw = await response.text()
    const text_content = stripHtml(raw)
    return {
      url,
      title: url,
      text_content,
      excerpt: createExcerpt(text_content),
      fetched_at: new Date().toISOString(),
    }
  }
}
