import { supabase } from '../../../lib/db'
import { AppError, CRUX_ERRORS } from '../shared/errors'

const DEFAULT_CREDITS = 3

export async function getOrSeedCredits(userId: string): Promise<{
  credits_remaining: number
  credits_total: number
}> {
  const { data: existing } = await supabase
    .from('crux_watch_credits')
    .select('credits_remaining, credits_total')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return existing

  const { data: seeded, error } = await supabase
    .from('crux_watch_credits')
    .insert({
      user_id: userId,
      credits_remaining: DEFAULT_CREDITS,
      credits_total: DEFAULT_CREDITS,
    })
    .select('credits_remaining, credits_total')
    .single()

  if (error || !seeded) {
    throw new AppError(500, 'WATCH_SEED_FAILED', 'Failed to initialize Watch credits.')
  }

  return seeded
}

export async function createWatchRegistration(
  userId: string,
  propertyId: string
): Promise<{ watchId: string; alreadyWatching: boolean }> {
  const { data: existing } = await supabase
    .from('crux_watch_registrations')
    .select('id')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (existing) return { watchId: existing.id, alreadyWatching: true }

  const { data: registration, error } = await supabase
    .from('crux_watch_registrations')
    .insert({ user_id: userId, property_id: propertyId })
    .select('id')
    .single()

  if (error || !registration) {
    throw new AppError(500, 'WATCH_REGISTER_FAILED', 'Watch registration failed.')
  }

  return { watchId: registration.id, alreadyWatching: false }
}

export async function registerWatch(
  userId: string,
  propertyId: string
): Promise<{ credits_remaining: number; watch_id: string; already_watching: boolean }> {
  const { data: existing } = await supabase
    .from('crux_watch_registrations')
    .select('id')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (existing) {
    const credits = await getOrSeedCredits(userId)
    return {
      credits_remaining: credits.credits_remaining,
      watch_id: existing.id,
      already_watching: true,
    }
  }

  const credits = await getOrSeedCredits(userId)
  if (credits.credits_remaining <= 0) {
    throw new AppError(
      CRUX_ERRORS.WATCH_CREDITS_EXHAUSTED.status,
      CRUX_ERRORS.WATCH_CREDITS_EXHAUSTED.code,
      CRUX_ERRORS.WATCH_CREDITS_EXHAUSTED.message
    )
  }

  const { data: updated, error: deductError } = await supabase
    .from('crux_watch_credits')
    .update({
      credits_remaining: credits.credits_remaining - 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('credits_remaining', credits.credits_remaining)
    .select('credits_remaining')
    .single()

  if (deductError || !updated) {
    throw new AppError(500, 'WATCH_DEDUCT_FAILED', 'Credit deduction failed. Please try again.')
  }

  const { data: registration, error: regError } = await supabase
    .from('crux_watch_registrations')
    .insert({ user_id: userId, property_id: propertyId })
    .select('id')
    .single()

  if (regError || !registration) {
    await supabase
      .from('crux_watch_credits')
      .update({
        credits_remaining: updated.credits_remaining + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    throw new AppError(500, 'WATCH_REGISTER_FAILED', 'Watch registration failed. Credit refunded.')
  }

  return {
    credits_remaining: updated.credits_remaining,
    watch_id: registration.id,
    already_watching: false,
  }
}
