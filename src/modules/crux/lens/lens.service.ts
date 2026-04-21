import { supabase } from '../../../lib/db'
import { AppError } from '../shared/errors'

export interface LensSessionRow {
  id: string
  created_at: string
  updated_at: string
  user_id: string | null
  property_id: string
  messages: unknown[]
  expires_at: string
}

export interface LensMessageRow {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export async function createSession(propertyId: string, userId?: string): Promise<LensSessionRow> {
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('crux_lens_sessions')
    .insert({
      property_id: propertyId,
      user_id: userId ?? null,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new AppError(500, 'SESSION_CREATE_FAILED', 'Failed to create Lens session.')
  }

  return data as unknown as LensSessionRow
}

export async function getSession(sessionId: string): Promise<LensSessionRow> {
  const { data, error } = await supabase
    .from('crux_lens_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw new AppError(500, 'DB_READ_FAILED', error.message)
  if (!data) throw new AppError(404, 'SESSION_NOT_FOUND', 'Lens session not found.')
  if (data.expires_at < new Date().toISOString()) {
    throw new AppError(410, 'SESSION_EXPIRED', 'This session has expired. Please start a new conversation.')
  }

  return data as unknown as LensSessionRow
}

export async function refreshSession(sessionId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('crux_lens_sessions')
    .update({ expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
}

export async function getMessageHistory(sessionId: string): Promise<LensMessageRow[]> {
  const { data, error } = await supabase
    .from('crux_lens_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[lens.service] getMessageHistory error:', error.message)
    return []
  }

  return (data ?? []) as unknown as LensMessageRow[]
}

export async function saveMessages(
  sessionId: string,
  userContent: string,
  assistantContent: string
): Promise<void> {
  const now = Date.now()

  const { error } = await supabase.from('crux_lens_messages').insert([
    {
      session_id: sessionId,
      role: 'user',
      content: userContent,
      created_at: new Date(now).toISOString(),
    },
    {
      session_id: sessionId,
      role: 'assistant',
      content: assistantContent,
      created_at: new Date(now + 1).toISOString(),
    },
  ])

  if (error) {
    console.error('[lens.service] saveMessages error:', error.message)
  }
}

export async function checkMessageLimit(sessionId: string): Promise<void> {
  const { count, error } = await supabase
    .from('crux_lens_messages')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  if (error) {
    console.error('[lens.service] checkMessageLimit error:', error.message)
    return
  }

  if ((count ?? 0) >= 30) {
    throw new AppError(429, 'LENS_MESSAGE_LIMIT', 'Session message limit reached. Please start a new session.')
  }
}
