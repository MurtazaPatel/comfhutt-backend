import { supabase } from '../lib/db';
import { AppError } from '../modules/crux/shared/errors';
import type { ScoreBreakdown } from '../modules/crux/shared/types';

interface ScoreSnapshot {
  totalScore: number;
  grade: string;
  categoryScores: ScoreBreakdown;
  confidence: number;
  timestamp: string;
}

interface PersistSearchPayload {
  clerkUserId: string;
  propertyId: string;
  addressRaw: string | null;
  cruxScore: number;
  scoreGrade: string;
  scoreSnapshot: ScoreSnapshot;
  shareToken?: string | null;
}

interface SearchHistoryRow {
  id: string;
  property_id: string;
  address_raw: string | null;
  crux_score: number;
  score_grade: string;
  score_snapshot: ScoreSnapshot;
  share_token: string | null;
  searched_at: string;
}

export async function persistSearch(payload: PersistSearchPayload): Promise<string> {
  const { data, error } = await supabase
    .from('crux_searches')
    .insert({
      clerk_user_id: payload.clerkUserId,
      property_id: payload.propertyId,
      address_raw: payload.addressRaw,
      crux_score: payload.cruxScore,
      score_grade: payload.scoreGrade,
      score_snapshot: payload.scoreSnapshot,
      share_token: payload.shareToken ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error({ error, clerkUserId: payload.clerkUserId }, 'SearchHistory: persist failed');
    throw new AppError(500, 'SEARCH_PERSIST_FAILED', 'Failed to save search history.');
  }

  console.info({ id: data.id, clerkUserId: payload.clerkUserId }, 'SearchHistory: persisted');
  return data.id;
}

export async function getRecentSearches(
  clerkUserId: string,
  limit = 10
): Promise<SearchHistoryRow[]> {
  const { data, error } = await supabase
    .from('crux_searches')
    .select('id, property_id, address_raw, crux_score, score_grade, score_snapshot, share_token, searched_at')
    .eq('clerk_user_id', clerkUserId)
    .order('searched_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error({ error, clerkUserId }, 'SearchHistory: fetch failed');
    throw new AppError(500, 'SEARCH_FETCH_FAILED', 'Failed to fetch search history.');
  }

  return (data ?? []) as SearchHistoryRow[];
}

export async function findRecentSearch(
  clerkUserId: string,
  propertyId: string,
  withinHours = 24
): Promise<SearchHistoryRow | null> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('crux_searches')
    .select('id, property_id, address_raw, crux_score, score_grade, score_snapshot, share_token, searched_at')
    .eq('clerk_user_id', clerkUserId)
    .eq('property_id', propertyId)
    .gte('searched_at', cutoff)
    .order('searched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error({ error, clerkUserId, propertyId }, 'SearchHistory: cache check failed');
    return null;
  }

  return data as SearchHistoryRow | null;
}
