import { firecrawlClient, firecrawlScrapeBreaker } from '../../../lib/firecrawl'
import type { PageContent, SearchResult } from '../shared/types'

export interface ResearchWebProvider {
  search(query: string, options?: { maxResults?: number }): Promise<SearchResult[]>
  fetchPage(url: string): Promise<PageContent>
  fetchPages?(urls: string[]): Promise<Map<string, string>>
  mapDomain?(url: string, search?: string): Promise<string[]>
  deepResearch?(query: string, domainHint?: string | null): Promise<SearchResult[]>
}

function createExcerpt(text: string, maxLength: number = 280): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function toSearchResult(r: {
  title?: string
  url?: string
  description?: string
  markdown?: string
}): SearchResult {
  return {
    title: r.title ?? 'Untitled',
    url: r.url ?? '',
    snippet: r.description ?? '',
    raw_content: r.markdown ?? null,
    score: null,
    published_at: null,
  }
}

export class FirecrawlWebProvider implements ResearchWebProvider {
  async search(query: string, options?: { maxResults?: number }): Promise<SearchResult[]> {
    const result = await firecrawlClient.search(query, {
      limit: options?.maxResults ?? 5,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: false,
      },
    })

    return (result.data?.web ?? [])
      .filter((r) => Boolean(r.url))
      .map(toSearchResult)
  }

  async fetchPage(url: string): Promise<PageContent> {
    const result = await firecrawlClient.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    })

    const markdown = result.data?.markdown ?? ''
    return {
      url,
      title: result.data?.metadata?.title ?? url,
      text_content: markdown,
      excerpt: createExcerpt(markdown),
      fetched_at: new Date().toISOString(),
    }
  }

  async fetchPages(urls: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()

    try {
      const result = await firecrawlClient.batchScrape(urls, {
        formats: ['markdown'],
        onlyMainContent: false,
      })
      if (result.success && result.data) {
        for (const item of result.data) {
          if (item.url && item.markdown) {
            map.set(item.url, item.markdown)
          }
        }
      }
      if (map.size > 0) return map
    } catch {}

    const scraped = await Promise.all(
      urls.map(async (url) => {
        try {
          const result = await firecrawlScrapeBreaker.fire(url, {
            formats: ['markdown'],
            onlyMainContent: true,
          }) as { success: boolean; data?: { markdown?: string; metadata?: { title?: string } } }
          return { url, content: result.success && result.data?.markdown ? result.data.markdown : '' }
        } catch {
          return { url, content: '' }
        }
      }),
    )

    for (const { url, content } of scraped) {
      if (content) map.set(url, content)
    }

    return map
  }

  async mapDomain(url: string, search?: string): Promise<string[]> {
    const result = await firecrawlClient.map(url, {
      limit: 100,
      search,
    })
    return (result.links ?? []).slice(0, 30)
  }

  async deepResearch(query: string, domainHint?: string | null): Promise<SearchResult[]> {
    const results: SearchResult[] = []

    const searchResult = await firecrawlClient.search(query, {
      limit: 4,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: false,
      },
    })
    if (searchResult.data?.web) {
      results.push(...searchResult.data.web.filter((r) => Boolean(r.url)).map(toSearchResult))
    }

    if (domainHint) {
      const domainMatch = domainHint.match(/site:([\w.-]+)/)
      const domain = domainMatch?.[1]
      if (domain) {
        try {
          const mappedUrls = await this.mapDomain(`https://${domain}`, query)
          if (mappedUrls.length > 0) {
            const batchContent = await this.fetchPages(mappedUrls.slice(0, 8))
            for (const [url, content] of batchContent) {
              results.push({
                title: url,
                url,
                snippet: content.slice(0, 280),
                raw_content: content,
                score: null,
                published_at: null,
              })
            }
          }
        } catch {}
      }
    }

    const seen = new Set(results.map((r) => r.url))
    return results.filter((r) => r.url && !seen.has(r.url) && seen.add(r.url) && seen.delete(r.url) === false)
  }
}