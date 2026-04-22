// CRUX Ingestion — address → geocode → normalized property profile
// MVP Module 1

import { supabase } from '../../../lib/db'
import { env } from '../../../config/env'
import type { PropertyProfile } from '../shared/types'
import { AppError } from '../shared/errors'

interface GeocodeApiResponse {
  status: string
  results: Array<{
    formatted_address: string
    geometry: { location: { lat: number; lng: number } }
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>
  }>
}

interface GeocodeData {
  address_normalized: string
  geocode_lat: number
  geocode_lng: number
  pin_code: string | undefined
  city: string | undefined
  state: string | undefined
}

export async function ingestProperty(addressRaw: string): Promise<PropertyProfile> {
  // Step 1: Input validation
  if (!addressRaw || addressRaw.trim().length < 10) {
    throw new AppError(400, 'INVALID_INPUT', 'Address must be at least 10 characters')
  }
  const trimmed = addressRaw.trim()

  // Step 2: Geocode cache lookup
  let geocodeData: GeocodeData | null = null

  const { data: cached, error: cacheError } = await supabase
    .from('crux_geocode_cache')
    .select('*')
    .eq('address_raw', trimmed)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (cacheError) {
    // Non-fatal — log and fall through to live geocode
    console.info('[ingestProperty] geocode cache lookup error:', cacheError.message)
  } else if (cached) {
    geocodeData = {
      address_normalized: cached.address_normalized,
      geocode_lat: Number(cached.geocode_lat),
      geocode_lng: Number(cached.geocode_lng),
      pin_code: cached.pin_code ?? undefined,
      city: cached.city ?? undefined,
      state: cached.state ?? undefined,
    }
  }

  // Step 3: Google Maps Geocoding API (cache miss only)
  if (!geocodeData) {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(trimmed)}&region=in&key=${env.GOOGLE_MAPS_API_KEY}`

    let geoResp: Response
    try {
      geoResp = await fetch(url)
    } catch {
      throw new AppError(422, 'GEOCODE_FAILED', 'Could not reach geocoding service')
    }

    const geoJson = await geoResp.json() as GeocodeApiResponse

    if (geoJson.status !== 'OK' || geoJson.results.length === 0) {
      throw new AppError(
        422,
        'GEOCODE_FAILED',
        'Could not geocode address. Please provide a more specific address.'
      )
    }

    const result = geoJson.results[0]
    const components = result.address_components

    const getComponent = (type: string): string | undefined =>
      components.find(c => c.types.includes(type))?.long_name

    const address_normalized = result.formatted_address
    const geocode_lat = result.geometry.location.lat
    const geocode_lng = result.geometry.location.lng
    const pin_code = getComponent('postal_code')
    const city = getComponent('locality') ?? getComponent('administrative_area_level_2')
    const state = getComponent('administrative_area_level_1')

    geocodeData = { address_normalized, geocode_lat, geocode_lng, pin_code, city, state }

    // Write to cache — upsert on address_raw UNIQUE constraint
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error: upsertCacheErr } = await supabase
      .from('crux_geocode_cache')
      .upsert(
        {
          address_raw: trimmed,
          address_normalized,
          geocode_lat,
          geocode_lng,
          pin_code: pin_code ?? null,
          city: city ?? null,
          state: state ?? null,
          expires_at: expiresAt,
        },
        { onConflict: 'address_raw' }
      )
    if (upsertCacheErr) {
      // Non-fatal — cached data missing is acceptable; property insert still proceeds
      console.info('[ingestProperty] geocode cache write error:', upsertCacheErr.message)
    }
  }

  const { address_normalized, geocode_lat, geocode_lng, pin_code, city, state } = geocodeData

  // Step 4: crux_properties — SELECT then INSERT (no UNIQUE constraint on address_raw)
  const { data: existing, error: selectErr } = await supabase
    .from('crux_properties')
    .select('*')
    .eq('address_raw', trimmed)
    .maybeSingle()

  if (selectErr) {
    throw new AppError(500, 'DB_WRITE_FAILED', 'Failed to save property profile')
  }

  if (existing) {
    return existing as unknown as PropertyProfile
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('crux_properties')
    .insert({
      address_raw: trimmed,
      address_normalized,
      geocode_lat,
      geocode_lng,
      pin_code: pin_code ?? null,
      city: city ?? null,
      state: state ?? null,
      property_type: null,
      approx_size_sqft: null,
    })
    .select('*')
    .single()

  if (insertErr || !inserted) {
    throw new AppError(500, 'DB_WRITE_FAILED', 'Failed to save property profile')
  }

  // Step 5: Return PropertyProfile — property_type is null until Lens clarification
  return inserted as unknown as PropertyProfile
}
