import { generate, safeJsonParse } from '../../../lib/llm'
import {
  firecrawlSearchBreaker,
  firecrawlScrapeBreaker,
  firecrawlCrawlBreaker,
  firecrawlInteractBreaker,
} from '../../../lib/firecrawl'
import { env } from '../../../config/env'
import type {
  PropertyProfile,
  FetcherResult,
  CpcbAqiData,
  NhbResidexData,
  Mca21Data,
  EcourtsData,
  CpwdData,
} from '../shared/types'

interface ExtractionInput {
  query: string
  searchLimit?: number
  scrapeUrls?: string[]
  interactPrompt?: string
  interactUrl?: string
  schema: Record<string, unknown>
  staleFallback?: unknown
  hints?: string
}

function aqiToCategory(aqi: number): CpcbAqiData['category'] {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Satisfactory'
  if (aqi <= 200) return 'Moderate'
  if (aqi <= 300) return 'Poor'
  if (aqi <= 400) return 'Very Poor'
  return 'Severe'
}

export async function firecrawlSearchAndExtract<T>(
  input: ExtractionInput,
  profile: PropertyProfile,
  sourceName: string,
): Promise<FetcherResult<T>> {
  const fetched_at = new Date().toISOString()
  const errors: string[] = []
  const markdownPool: string[] = []

  try {
    const searchResult = await firecrawlSearchBreaker.fire(input.query, {
      limit: input.searchLimit ?? env.FIRECRAWL_SEARCH_MAX_RESULTS,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: false,
      },
    }) as { success: boolean; data: { web: Array<{ markdown?: string; url?: string }> }; warning?: string }

    if (searchResult.success && searchResult.data?.web) {
      for (const item of searchResult.data.web) {
        if (item.markdown) markdownPool.push(item.markdown)
      }
    }
  } catch (error) {
    errors.push(`SEARCH_FAILED: ${(error as Error)?.message ?? 'unknown'}`)
  }

  if (input.scrapeUrls) {
    for (const url of input.scrapeUrls) {
      try {
        const scrapeResult = await firecrawlScrapeBreaker.fire(url, {
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }) as { success: boolean; data?: { markdown?: string } }

        if (scrapeResult.success && scrapeResult.data?.markdown) {
          markdownPool.push(scrapeResult.data.markdown)
        }
      } catch (error) {
        errors.push(`SCRAPE_FAILED(${url}): ${(error as Error)?.message ?? 'unknown'}`)
      }
    }
  }

  if (input.interactPrompt && input.interactUrl) {
    try {
      const interactResult = await firecrawlInteractBreaker.fire(
        input.interactUrl,
        input.interactPrompt,
        { schema: input.schema },
      ) as { success: boolean; data?: { markdown?: string; extracted?: Record<string, unknown> } }

      if (interactResult.success) {
        if (interactResult.data?.markdown) markdownPool.push(interactResult.data.markdown)
        if (interactResult.data?.extracted) {
          return {
            source: sourceName,
            data: interactResult.data.extracted as T,
            success: true,
            fetched_at,
          }
        }
      }
    } catch (error) {
      errors.push(`INTERACT_FAILED: ${(error as Error)?.message ?? 'unknown'}`)
    }
  }

  if (markdownPool.length > 0) {
    try {
      const extracted = await geminiExtract<T>(markdownPool.join('\n\n---\n\n'), input.schema, profile, input.hints)
      if (extracted) {
        return { source: sourceName, data: extracted, success: true, fetched_at }
      }
    } catch (error) {
      errors.push(`GEMINI_EXTRACTION_FAILED: ${(error as Error)?.message ?? 'unknown'}`)
    }
  }

  if (input.staleFallback !== undefined) {
    console.warn(`[fetcher] STALE_${sourceName.toUpperCase()}_DATA: using mock data for ${profile.city}`)
    return {
      source: sourceName,
      data: input.staleFallback as T,
      success: false,
      error: `${sourceName.toUpperCase()}_ALL_SOURCES_FAILED`,
      fetched_at,
    }
  }

  return {
    source: sourceName,
    data: null,
    success: false,
    error: errors[0] ?? `${sourceName.toUpperCase()}_ALL_SOURCES_FAILED`,
    fetched_at,
  }
}

export async function firecrawlSearchAndCrawlExtract<T>(
  query: string,
  crawlUrl: string,
  includePaths: string[],
  schema: Record<string, unknown>,
  profile: PropertyProfile,
  sourceName: string,
  staleFallback?: unknown,
  hints?: string,
): Promise<FetcherResult<T>> {
  const fetched_at = new Date().toISOString()
  const errors: string[] = []
  const markdownPool: string[] = []

  try {
    const searchResult = await firecrawlSearchBreaker.fire(query, {
      limit: env.FIRECRAWL_SEARCH_MAX_RESULTS,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: false,
      },
    }) as { success: boolean; data: { web: Array<{ markdown?: string }> }; warning?: string }

    if (searchResult.success && searchResult.data?.web) {
      for (const item of searchResult.data.web) {
        if (item.markdown) markdownPool.push(item.markdown)
      }
    }
  } catch (error) {
    errors.push(`SEARCH_FAILED: ${(error as Error)?.message ?? 'unknown'}`)
  }

  try {
    const crawlResult = await firecrawlCrawlBreaker.fire(crawlUrl, {
      limit: env.FIRECRAWL_CRAWL_MAX_PAGES,
      includePaths,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: false,
      },
    }) as { success: boolean; data?: Array<{ markdown?: string }> }

    if (crawlResult.success && crawlResult.data) {
      for (const item of crawlResult.data) {
        if (item.markdown) markdownPool.push(item.markdown)
      }
    }
  } catch (error) {
    errors.push(`CRAWL_FAILED: ${(error as Error)?.message ?? 'unknown'}`)
  }

  if (markdownPool.length > 0) {
    try {
      const extracted = await geminiExtract<T>(markdownPool.join('\n\n---\n\n'), schema, profile, hints)
      if (extracted) {
        return { source: sourceName, data: extracted, success: true, fetched_at }
      }
    } catch (error) {
      errors.push(`GEMINI_EXTRACTION_FAILED: ${(error as Error)?.message ?? 'unknown'}`)
    }
  }

  if (staleFallback !== undefined) {
    console.warn(`[fetcher] STALE_${sourceName.toUpperCase()}_DATA: using mock data for ${profile.state}`)
    return {
      source: sourceName,
      data: staleFallback as T,
      success: false,
      error: `${sourceName.toUpperCase()}_ALL_SOURCES_FAILED`,
      fetched_at,
    }
  }

  return {
    source: sourceName,
    data: null,
    success: false,
    error: errors[0] ?? `${sourceName.toUpperCase()}_ALL_SOURCES_FAILED`,
    fetched_at,
  }
}

async function geminiExtract<T>(
  markdown: string,
  schema: Record<string, unknown>,
  profile: PropertyProfile,
  hints?: string,
): Promise<T | null> {
  const hintBlock = hints ? `\n\nEXTRACTION HINTS:\n${hints}` : ''

  const systemPrompt = `You are a precise data extraction engine. Extract structured data from the provided markdown content according to the schema.

RULES:
1. Output ONLY valid JSON matching the schema exactly — nothing else.
2. No markdown wrapping, no explanation text, no backticks.
3. For EVERY field in the schema, search the content thoroughly. Prefer extracting actual values.
4. For numeric fields: look for numbers, percentages, counts anywhere in the text. Parse "$1,234" as 1234, "2.5%" as 2.5, "500 cases" as 500.
5. For status/enum fields: match the most relevant value from the enum list. If text says "company is active" → "Active".
6. For date/time fields: extract ISO format dates if present.
7. For boolean fields: infer from context. "no NPA flag found" → false, "has defaults" → true.
8. Only return null for a field if the content genuinely contains no relevant data after thorough search.
9. City context: ${profile.city}, ${profile.state}${hintBlock}`

  const userPrompt = `SCHEMA:\n${JSON.stringify(schema, null, 2)}\n\nCONTENT:\n${markdown.slice(0, 12000)}`

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const raw = await generate({
        strategy: 'primary',
        systemInstruction: systemPrompt,
        prompt: userPrompt,
        temperature: 0.1,
        maxOutputTokens: 4096,
      })
      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

      const parsed = safeJsonParse<T>(clean)
      if (parsed) return parsed

      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const matchParsed = safeJsonParse<T>(jsonMatch[0])
        if (matchParsed) return matchParsed
      }
      return null
    } catch (error) {
      const msg = (error as Error)?.message ?? 'unknown'
      if (attempt >= 2) {
        console.error('[geminiExtract] exhausted retries:', msg)
        return null
      }
      const waitMs = attempt === 0 ? 2000 : 3000
      console.warn(`[geminiExtract] attempt ${attempt + 1} failed, retrying in ${waitMs}ms: ${msg.slice(0, 100)}`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
  return null
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const CPCB_AQI_SCHEMA = {
  type: 'object',
  properties: {
    aqi: { type: 'number' },
    category: { type: 'string', enum: ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'] },
    station: { type: 'string' },
    recorded_at: { type: 'string' },
  },
}

const NHB_RESIDEX_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string' },
    property_type: { type: 'string' },
    hpi_current: { type: 'number' },
    hpi_qoq_change: { type: 'number' },
    period: { type: 'string' },
  },
}

const MCA21_SCHEMA = {
  type: 'object',
  properties: {
    company_name: { type: 'string' },
    cin: { type: 'string' },
    company_status: { type: 'string', enum: ['Active', 'Struck Off', 'Under Liquidation', 'Dormant'] },
    npa_flag: { type: 'boolean' },
    incorporation_date: { type: 'string' },
    director_count: { type: 'number' },
    data_source: { type: 'string' },
  },
}

const ECOURTS_SCHEMA = {
  type: 'object',
  properties: {
    cases_found: { type: 'number' },
    open_cases: { type: 'number' },
    closed_cases: { type: 'number' },
    case_types: { type: 'array', items: { type: 'string' } },
  },
}

const CPWD_SCHEMA = {
  type: 'object',
  properties: {
    state: { type: 'string' },
    city_tier: { type: 'string', enum: ['tier1', 'tier2', 'tier3'] },
    construction_cost_per_sqft: { type: 'number' },
    last_updated: { type: 'string' },
    data_source: { type: 'string' },
  },
}

// ── Stale fallback data ──────────────────────────────────────────────────────

function buildAqiStaleFallback(city: string): CpcbAqiData {
  const cityLower = city.toLowerCase()
  const aqiMap: Record<string, number> = {
    ahmedabad: 160, mumbai: 180, delhi: 280, bangalore: 90,
    bengaluru: 90, pune: 140, hyderabad: 150, chennai: 120,
    kolkata: 170, jaipur: 190, lucknow: 180, rajkot: 130,
    surat: 155, vadodara: 140,
  }
  const aqi = aqiMap[cityLower] ?? 160
  return {
    aqi,
    category: aqiToCategory(aqi),
    station: `${city} (stale average)`,
    recorded_at: new Date().toISOString(),
  }
}

interface ResidexMockEntry {
  hpi_current: number
  hpi_qoq_change: number
}

const RESIDEX_MOCK: Record<string, ResidexMockEntry> = {
  ahmedabad: { hpi_current: 185, hpi_qoq_change: 2.1 },
  mumbai: { hpi_current: 310, hpi_qoq_change: 1.8 },
  delhi: { hpi_current: 265, hpi_qoq_change: 2.5 },
  bangalore: { hpi_current: 290, hpi_qoq_change: 3.2 },
  bengaluru: { hpi_current: 290, hpi_qoq_change: 3.2 },
  pune: { hpi_current: 210, hpi_qoq_change: 2.8 },
  hyderabad: { hpi_current: 250, hpi_qoq_change: 3.5 },
  chennai: { hpi_current: 195, hpi_qoq_change: 2.0 },
  kolkata: { hpi_current: 145, hpi_qoq_change: 1.5 },
  jaipur: { hpi_current: 160, hpi_qoq_change: 2.3 },
  lucknow: { hpi_current: 135, hpi_qoq_change: 1.9 },
  rajkot: { hpi_current: 130, hpi_qoq_change: 1.7 },
  surat: { hpi_current: 155, hpi_qoq_change: 2.2 },
  vadodara: { hpi_current: 140, hpi_qoq_change: 1.8 },
}

function buildResidexStaleFallback(city: string): NhbResidexData | undefined {
  const key = city.toLowerCase().trim()
  const entry = RESIDEX_MOCK[key]
  if (!entry) return undefined
  return {
    city,
    property_type: 'residential',
    hpi_current: entry.hpi_current,
    hpi_qoq_change: entry.hpi_qoq_change,
    period: 'Q3 2025',
  }
}

interface CpwdMockEntry {
  city_tier: 'tier1' | 'tier2' | 'tier3'
  construction_cost_per_sqft: number
}

const CPWD_RATES_MOCK: Record<string, CpwdMockEntry> = {
  gujarat: { city_tier: 'tier2', construction_cost_per_sqft: 175000 },
  maharashtra: { city_tier: 'tier1', construction_cost_per_sqft: 280000 },
  karnataka: { city_tier: 'tier1', construction_cost_per_sqft: 260000 },
  telangana: { city_tier: 'tier1', construction_cost_per_sqft: 240000 },
  tamil_nadu: { city_tier: 'tier1', construction_cost_per_sqft: 230000 },
  delhi: { city_tier: 'tier1', construction_cost_per_sqft: 350000 },
  uttar_pradesh: { city_tier: 'tier2', construction_cost_per_sqft: 140000 },
  rajasthan: { city_tier: 'tier2', construction_cost_per_sqft: 150000 },
  west_bengal: { city_tier: 'tier2', construction_cost_per_sqft: 160000 },
}

function buildCpwdStaleFallback(state: string): CpwdData {
  const key = state.toLowerCase().trim().replace(/ /g, '_')
  const entry = CPWD_RATES_MOCK[key] ?? {
    city_tier: 'tier3' as const,
    construction_cost_per_sqft: 130000,
  }
  return {
    state,
    city_tier: entry.city_tier,
    construction_cost_per_sqft: entry.construction_cost_per_sqft,
    last_updated: '2025-01-01',
  }
}

// ── Source-specific fetch functions ──────────────────────────────────────────

export async function fetchCpcbAqiFirecrawl(profile: PropertyProfile): Promise<FetcherResult<CpcbAqiData>> {
  const fetched_at = new Date().toISOString()
  const markdownPool: string[] = []
  const descriptions: string[] = []

  try {
    const searchResult = await firecrawlSearchBreaker.fire(
      `${profile.city} ${profile.state} AQI air quality index 2025`,
      {
        limit: 3,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: false },
      },
    ) as { success: boolean; data: { web: Array<{ markdown?: string; description?: string; metadata?: { statusCode?: number } }> } }

    if (searchResult.success && searchResult.data?.web) {
      for (const item of searchResult.data.web) {
        if (item.markdown && !item.metadata?.statusCode) {
          markdownPool.push(item.markdown)
        }
        if (item.description) {
          descriptions.push(item.description)
        }
      }
    }
  } catch {}

  const stateSlug = profile.state.toLowerCase().replace(/\s+/g, '-')
  const citySlug = profile.city.toLowerCase().replace(/\s+/g, '-')
  const scrapeUrls = [
    `https://www.aqi.in/dashboard/india/${stateSlug}/${citySlug}`,
    `https://app.cpcbccr.com/caaqms/caaqms_viewData_v2`,
  ]

  for (const url of scrapeUrls) {
    try {
      const scrapeResult = await firecrawlScrapeBreaker.fire(url, {
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }) as { success: boolean; data?: { markdown?: string } }
      if (scrapeResult.success && scrapeResult.data?.markdown) {
        markdownPool.push(scrapeResult.data.markdown)
      }
    } catch {}
  }

  if (markdownPool.length > 0) {
    const extracted = await geminiExtract<CpcbAqiData>(
      markdownPool.join('\n\n---\n\n'),
      CPCB_AQI_SCHEMA,
      profile,
      'AQI is typically a 2-3 digit number like 85, 120, 250. Category is one of: Good (0-50), Satisfactory (51-100), Moderate (101-200), Poor (201-300), Very Poor (301-400), Severe (401+). Station name is usually a city area name. recorded_at is a date string.',
    )
    if (extracted) {
      return { source: 'cpcb_aqi', data: extracted, success: true, fetched_at }
    }
  }

  for (const desc of descriptions) {
    const aqiMatch = desc.match(/(\d{2,3})\s*(AQI|Moderate|Poor|Good|Satisfactory|Unhealthy|Very\s*Poor|Hazardous|Severe)/i)
    if (aqiMatch) {
      const aqi = parseInt(aqiMatch[1], 10)
      return {
        source: 'cpcb_aqi',
        data: { aqi, category: aqiToCategory(aqi), station: profile.city, recorded_at: fetched_at },
        success: true,
        fetched_at,
      }
    }
  }

  const stale = buildAqiStaleFallback(profile.city)
  console.warn(`[fetcher] STALE_CPCB_AQI_DATA: using mock data for ${profile.city}`)
  return { source: 'cpcb_aqi', data: stale, success: false, error: 'CPCB_AQI_ALL_SOURCES_FAILED', fetched_at }
}

export async function fetchNhbResidexFirecrawl(profile: PropertyProfile): Promise<FetcherResult<NhbResidexData>> {
  const staleFallback = buildResidexStaleFallback(profile.city)
  if (!staleFallback) {
    return {
      source: 'nhb_residex',
      data: null,
      success: false,
      error: 'CITY_NOT_IN_RESIDEX',
      fetched_at: new Date().toISOString(),
    }
  }

  return firecrawlSearchAndExtract<NhbResidexData>(
    {
      query: `NHB RESIDEX quarterly HPI ${profile.city} 2025 site:nhb.org.in`,
      searchLimit: 3,
      scrapeUrls: ['https://residex.nhbonline.org.in/'],
      interactPrompt: `Search for HPI data for ${profile.city} and extract: current HPI value, quarter-on-quarter change percentage, and the period`,
      interactUrl: 'https://residex.nhbonline.org.in/',
      schema: NHB_RESIDEX_SCHEMA,
      staleFallback,
      hints: `HPI (House Price Index) is typically a number like 185, 210, 310. QoQ change is a percentage like 2.1, -0.5, 3.2. property_type should be "residential". period format like "Q3 2025" or "Jan-Mar 2025". Look for numbers in table cells near the city name "${profile.city}".`,
    },
    profile,
    'nhb_residex',
  )
}

export async function fetchMca21Firecrawl(companyName: string, profile: PropertyProfile): Promise<FetcherResult<Mca21Data>> {
  const fetched_at = new Date().toISOString()
  const markdownPool: string[] = []

  const queryGroups = [
    [
      `"${companyName}" company CIN status zaubacorp private limited`,
      `"${companyName}" company details zaubacorp incorporation Gujarat Ahmedabad`,
    ],
    [
      `"${companyName}" tofler company financials registration`,
      `"${companyName}" tofler company status Ahmedabad builders`,
    ],
    [
      `"${companyName}" builders developers MCA registration Ahmedabad Gujarat`,
      `"${companyName}" builder real estate company status npa defaulter India`,
    ],
  ]

  const searchTasks = queryGroups.flatMap((queries) =>
    queries.map((q) =>
      firecrawlSearchBreaker.fire(q, {
        limit: 2,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: false },
      }).catch(() => null),
    ),
  )

  const results = await Promise.all(searchTasks)
  for (const result of results) {
    const r = result as { success?: boolean; data?: { web?: Array<{ markdown?: string }> } } | null
    if (r?.success && r.data?.web) {
      for (const item of r.data.web) {
        if (item.markdown) markdownPool.push(item.markdown)
      }
    }
  }

  if (markdownPool.length > 0) {
    const extracted = await geminiExtract<Mca21Data>(
      markdownPool.join('\n\n---\n\n'),
      MCA21_SCHEMA,
      profile,
      `Look for company registration data. CIN format: L + 5 digits + 2 letters + 4 digits + PLC + 6 digits (e.g. L74120MH1985PLC035308). Company status is one of: Active, Struck Off, Under Liquidation, Dormant. NPA flag: true if text mentions "default", "NPA", "non-performing asset", "wilful defaulter", "negative list". Incorporation date like "1985-01-15" or "15 Jan 1985". Director count is a number. data_source is "zaubacorp" or "tofler" or "mca".`,
    )
    if (extracted) {
      return { source: 'mca21', data: extracted, success: true, fetched_at }
    }
  }

  return {
    source: 'mca21',
    data: null,
    success: false,
    error: 'MCA21_ALL_SOURCES_UNAVAILABLE',
    fetched_at,
  }
}

export async function fetchEcourtsFirecrawl(companyName: string, profile: PropertyProfile): Promise<FetcherResult<EcourtsData>> {
  const fetched_at = new Date().toISOString()
  const markdownPool: string[] = []

  const queries = [
    `${companyName} builder developer court case litigation dispute ecourts`,
    `${companyName} consumer forum NCDRC complaint litigation`,
    `${companyName} builder legal case dispute India 2025`,
  ]

  const searchTasks = queries.map((q) =>
    firecrawlSearchBreaker.fire(q, {
      limit: 3,
      scrapeOptions: { formats: ['markdown'], onlyMainContent: false },
    }).catch(() => null),
  )

  const results = await Promise.all(searchTasks)
  for (const result of results) {
    const r = result as { success?: boolean; data?: { web?: Array<{ markdown?: string }> } } | null
    if (r?.success && r.data?.web) {
      for (const item of r.data.web) {
        if (item.markdown) markdownPool.push(item.markdown)
      }
    }
  }

  if (markdownPool.length > 0) {
    const extracted = await geminiExtract<EcourtsData>(
      markdownPool.join('\n\n---\n\n'),
      ECOURTS_SCHEMA,
      profile,
      `Look for court case counts. cases_found is total number of cases/entries/hits found. open_cases is cases still pending/open/active. closed_cases is cases disposed/closed/resolved. case_types is an array of strings like ["Civil", "Criminal", "Consumer", "Property", "Arbitration"]. Extract whatever numbers and types you find.`,
    )
    if (extracted) {
      return { source: 'ecourts', data: extracted, success: true, fetched_at }
    }
  }

  return {
    source: 'ecourts',
    data: null,
    success: false,
    error: 'ECOURTS_UNAVAILABLE',
    fetched_at,
  }
}

export async function fetchCpwdFirecrawl(profile: PropertyProfile): Promise<FetcherResult<CpwdData>> {
  return firecrawlSearchAndCrawlExtract<CpwdData>(
    `CPWD plinth area rates schedule of rates ${profile.state} 2025 site:cpwd.gov.in`,
    'https://cpwd.gov.in/',
    ['.*schedule.*', '.*rates.*', '.*plinth.*', '.*circular.*', '.*sor.*'],
    CPWD_SCHEMA,
    profile,
    'cpwd',
    buildCpwdStaleFallback(profile.state),
    'Construction cost per sqft is a number like 175000, 280000 (in INR paise — so 175000 paise = Rs. 1750 per sqft). city_tier is "tier1", "tier2", or "tier3". last_updated is a date like "2025-01-01" or "January 2025". Look at the state "${profile.state}" specifically. data_source should be the URL where the data was extracted from.',
  )
}