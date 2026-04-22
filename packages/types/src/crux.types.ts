// ─── SCORE REQUEST/RESPONSE ───────────────────────────────────────────────

export type PropertyLifecycleStage =
  | 'near_completion'
  | 'delivered'
  | 'established'
  | 'mature';

export type InvestorIntentProfile = 'yield' | 'appreciation' | 'balanced';

export type MacroMarketCycle =
  | 'growth'
  | 'consolidation'
  | 'correction'
  | 'recovery';

export interface ScoreRequest {
  propertyAddress: string;
  city: string;
  pincode: string;
  lifecycleStage: PropertyLifecycleStage;
  investorIntent: InvestorIntentProfile;
  lat?: number;
  lng?: number;
}

export interface ParameterScore {
  name: string;
  score: number;          // 0–100
  weight: number;         // 0–1
  source: string;
  confidence: number;     // 0–1
  lastUpdated: string;    // ISO date
}

export interface ScoreCategory {
  name: string;
  score: number;          // 0–100, weighted aggregate
  parameters: ParameterScore[];
}

export interface ValuationMethod {
  method: 'income_capitalization' | 'sales_comparable' | 'replacement_cost';
  fairValueMin: number;   // paise
  fairValueMax: number;   // paise
  confidence: number;     // 0–1
}

export interface MarketValuation {
  weightedFairValueMin: number;  // paise
  weightedFairValueMax: number;  // paise
  methodVarianceFlag: boolean;   // true if > 15% divergence between methods
  methods: ValuationMethod[];
  vsListedPricePercent?: number; // positive = undervalued vs listed
}

export interface CruxScoreResponse {
  scoreId: string;
  shareToken: string;
  compositeScore: number;        // 0–100
  macroMarketCycle: MacroMarketCycle;
  categories: ScoreCategory[];
  valuation: MarketValuation;
  reportSummary: string;         // SEBI-safe narrative, 200–300 words
  confidenceScore: number;       // 0–1, degrades on partial data
  methodologyVersion: string;    // e.g. "crux-v1.2"
  createdAt: string;
}

// ─── LENS (CHAT) REQUEST/RESPONSE ────────────────────────────────────────

export interface LensMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface LensRequest {
  scoreId: string;
  message: string;
  history: LensMessage[];
}

// Lens streams SSE — each event is a LensStreamChunk
export interface LensStreamChunk {
  type: 'delta' | 'done' | 'error';
  content?: string;
  error?: string;
}

// ─── WATCH REQUEST/RESPONSE ──────────────────────────────────────────────

export interface WatchCreateRequest {
  propertyAddress: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
}

export interface WatchEntry {
  watchId: string;
  userId: string;
  propertyAddress: string;
  city: string;
  pincode: string;
  lastScoreId?: string;
  lastCompositeScore?: number;
  alertThreshold: number;        // default: 5-point swing triggers alert
  isActive: boolean;
  createdAt: string;
}

export interface WatchListResponse {
  watches: WatchEntry[];
  remainingCredits: number;
}

// ─── REPORT REQUEST/RESPONSE ─────────────────────────────────────────────

export interface ReportRequest {
  scoreId: string;
}

export interface ReportSection {
  title: string;
  content: string;
}

export interface CruxReportResponse {
  reportId: string;
  scoreId: string;
  sections: ReportSection[];
  generatedAt: string;
  downloadUrl?: string;          // only for Pro users
}

// ─── CARD SHARE ──────────────────────────────────────────────────────────

export interface CardShareResponse {
  shareToken: string;
  shareUrl: string;              // crux.comfhutt.com/card/[shareToken]
  ogTitle: string;
  ogDescription: string;
  compositeScore: number;
  propertyAddress: string;
  expiresAt: string;
}
