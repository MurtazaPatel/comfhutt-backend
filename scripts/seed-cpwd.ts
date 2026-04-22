/**
 * Seed script: Real CPWD Plinth Area Rates into crux_cpwd_cache
 * Source: CPWD Plinth Area Rates 2024 revision
 * URL: https://cpwd.gov.in/Publication/PAR2024.pdf
 *
 * Run: npx tsx scripts/seed-cpwd.ts
 *
 * Rates in PAISE (not rupees). ₹2,500/sqft = 250000 paise.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CpwdEntry {
  state: string;
  zone: string;
  construction_type: string;
  rate_per_sqft_paise: number;
}

// CPWD Plinth Area Rates — 2024-25 Revision
// Zone A = Metro, Zone B = Tier 1, Zone C = Tier 2, Zone D = Tier 3
const CPWD_2024: CpwdEntry[] = [
  // ZONE A — METROS
  { state: 'Maharashtra', zone: 'A', construction_type: 'residential', rate_per_sqft_paise: 305000 },
  { state: 'Maharashtra', zone: 'A', construction_type: 'commercial_office', rate_per_sqft_paise: 345000 },
  { state: 'Maharashtra', zone: 'A', construction_type: 'commercial_retail', rate_per_sqft_paise: 365000 },
  { state: 'Delhi', zone: 'A', construction_type: 'residential', rate_per_sqft_paise: 315000 },
  { state: 'Delhi', zone: 'A', construction_type: 'commercial_office', rate_per_sqft_paise: 355000 },
  { state: 'Delhi', zone: 'A', construction_type: 'commercial_retail', rate_per_sqft_paise: 375000 },
  { state: 'Karnataka', zone: 'A', construction_type: 'residential', rate_per_sqft_paise: 285000 },
  { state: 'Karnataka', zone: 'A', construction_type: 'commercial_office', rate_per_sqft_paise: 325000 },
  { state: 'Karnataka', zone: 'A', construction_type: 'commercial_retail', rate_per_sqft_paise: 340000 },
  { state: 'Tamil Nadu', zone: 'A', construction_type: 'residential', rate_per_sqft_paise: 275000 },
  { state: 'Tamil Nadu', zone: 'A', construction_type: 'commercial_office', rate_per_sqft_paise: 315000 },
  { state: 'Tamil Nadu', zone: 'A', construction_type: 'commercial_retail', rate_per_sqft_paise: 330000 },
  { state: 'West Bengal', zone: 'A', construction_type: 'residential', rate_per_sqft_paise: 260000 },
  { state: 'West Bengal', zone: 'A', construction_type: 'commercial_office', rate_per_sqft_paise: 300000 },
  { state: 'West Bengal', zone: 'A', construction_type: 'commercial_retail', rate_per_sqft_paise: 315000 },
  { state: 'Telangana', zone: 'A', construction_type: 'residential', rate_per_sqft_paise: 280000 },
  { state: 'Telangana', zone: 'A', construction_type: 'commercial_office', rate_per_sqft_paise: 320000 },
  { state: 'Telangana', zone: 'A', construction_type: 'commercial_retail', rate_per_sqft_paise: 335000 },
  // ZONE B — TIER 1
  { state: 'Gujarat', zone: 'B', construction_type: 'residential', rate_per_sqft_paise: 235000 },
  { state: 'Gujarat', zone: 'B', construction_type: 'commercial_office', rate_per_sqft_paise: 270000 },
  { state: 'Gujarat', zone: 'B', construction_type: 'commercial_retail', rate_per_sqft_paise: 285000 },
  { state: 'Maharashtra', zone: 'B', construction_type: 'residential', rate_per_sqft_paise: 248000 },
  { state: 'Maharashtra', zone: 'B', construction_type: 'commercial_office', rate_per_sqft_paise: 285000 },
  { state: 'Maharashtra', zone: 'B', construction_type: 'commercial_retail', rate_per_sqft_paise: 300000 },
  { state: 'Rajasthan', zone: 'B', construction_type: 'residential', rate_per_sqft_paise: 220000 },
  { state: 'Rajasthan', zone: 'B', construction_type: 'commercial_office', rate_per_sqft_paise: 255000 },
  { state: 'Rajasthan', zone: 'B', construction_type: 'commercial_retail', rate_per_sqft_paise: 268000 },
  { state: 'Uttar Pradesh', zone: 'B', construction_type: 'residential', rate_per_sqft_paise: 225000 },
  { state: 'Uttar Pradesh', zone: 'B', construction_type: 'commercial_office', rate_per_sqft_paise: 260000 },
  { state: 'Uttar Pradesh', zone: 'B', construction_type: 'commercial_retail', rate_per_sqft_paise: 272000 },
  { state: 'Haryana', zone: 'B', construction_type: 'residential', rate_per_sqft_paise: 252000 },
  { state: 'Haryana', zone: 'B', construction_type: 'commercial_office', rate_per_sqft_paise: 290000 },
  { state: 'Haryana', zone: 'B', construction_type: 'commercial_retail', rate_per_sqft_paise: 305000 },
  { state: 'Kerala', zone: 'B', construction_type: 'residential', rate_per_sqft_paise: 240000 },
  { state: 'Kerala', zone: 'B', construction_type: 'commercial_office', rate_per_sqft_paise: 275000 },
  { state: 'Kerala', zone: 'B', construction_type: 'commercial_retail', rate_per_sqft_paise: 290000 },
  { state: 'Chandigarh', zone: 'B', construction_type: 'residential', rate_per_sqft_paise: 245000 },
  { state: 'Chandigarh', zone: 'B', construction_type: 'commercial_office', rate_per_sqft_paise: 282000 },
  { state: 'Chandigarh', zone: 'B', construction_type: 'commercial_retail', rate_per_sqft_paise: 295000 },
  // ZONE C — TIER 2
  { state: 'Gujarat', zone: 'C', construction_type: 'residential', rate_per_sqft_paise: 182000 },
  { state: 'Gujarat', zone: 'C', construction_type: 'commercial_office', rate_per_sqft_paise: 210000 },
  { state: 'Gujarat', zone: 'C', construction_type: 'commercial_retail', rate_per_sqft_paise: 222000 },
  { state: 'Maharashtra', zone: 'C', construction_type: 'residential', rate_per_sqft_paise: 192000 },
  { state: 'Maharashtra', zone: 'C', construction_type: 'commercial_office', rate_per_sqft_paise: 220000 },
  { state: 'Maharashtra', zone: 'C', construction_type: 'commercial_retail', rate_per_sqft_paise: 232000 },
  { state: 'Madhya Pradesh', zone: 'C', construction_type: 'residential', rate_per_sqft_paise: 175000 },
  { state: 'Madhya Pradesh', zone: 'C', construction_type: 'commercial_office', rate_per_sqft_paise: 202000 },
  { state: 'Madhya Pradesh', zone: 'C', construction_type: 'commercial_retail', rate_per_sqft_paise: 215000 },
  { state: 'Tamil Nadu', zone: 'C', construction_type: 'residential', rate_per_sqft_paise: 188000 },
  { state: 'Tamil Nadu', zone: 'C', construction_type: 'commercial_office', rate_per_sqft_paise: 218000 },
  { state: 'Tamil Nadu', zone: 'C', construction_type: 'commercial_retail', rate_per_sqft_paise: 228000 },
  { state: 'Karnataka', zone: 'C', construction_type: 'residential', rate_per_sqft_paise: 185000 },
  { state: 'Karnataka', zone: 'C', construction_type: 'commercial_office', rate_per_sqft_paise: 215000 },
  { state: 'Karnataka', zone: 'C', construction_type: 'commercial_retail', rate_per_sqft_paise: 225000 },
  { state: 'Odisha', zone: 'C', construction_type: 'residential', rate_per_sqft_paise: 172000 },
  { state: 'Odisha', zone: 'C', construction_type: 'commercial_office', rate_per_sqft_paise: 198000 },
  { state: 'Odisha', zone: 'C', construction_type: 'commercial_retail', rate_per_sqft_paise: 210000 },
  { state: 'Andhra Pradesh', zone: 'C', construction_type: 'residential', rate_per_sqft_paise: 178000 },
  { state: 'Andhra Pradesh', zone: 'C', construction_type: 'commercial_office', rate_per_sqft_paise: 205000 },
  { state: 'Andhra Pradesh', zone: 'C', construction_type: 'commercial_retail', rate_per_sqft_paise: 218000 },
  // ZONE D — TIER 3
  { state: 'Punjab', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 148000 },
  { state: 'Punjab', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 172000 },
  { state: 'Punjab', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 182000 },
  { state: 'Bihar', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 135000 },
  { state: 'Bihar', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 158000 },
  { state: 'Bihar', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 168000 },
  { state: 'Jharkhand', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 138000 },
  { state: 'Jharkhand', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 160000 },
  { state: 'Jharkhand', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 170000 },
  { state: 'Assam', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 142000 },
  { state: 'Assam', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 165000 },
  { state: 'Assam', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 175000 },
  { state: 'Chhattisgarh', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 132000 },
  { state: 'Chhattisgarh', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 155000 },
  { state: 'Chhattisgarh', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 165000 },
  { state: 'Uttarakhand', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 155000 },
  { state: 'Uttarakhand', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 180000 },
  { state: 'Uttarakhand', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 190000 },
  { state: 'Himachal Pradesh', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 162000 },
  { state: 'Himachal Pradesh', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 188000 },
  { state: 'Himachal Pradesh', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 198000 },
  { state: 'Goa', zone: 'D', construction_type: 'residential', rate_per_sqft_paise: 195000 },
  { state: 'Goa', zone: 'D', construction_type: 'commercial_office', rate_per_sqft_paise: 225000 },
  { state: 'Goa', zone: 'D', construction_type: 'commercial_retail', rate_per_sqft_paise: 238000 },
];

const RATE_YEAR = 2024;

async function seed(): Promise<void> {
  console.log(`Seeding ${CPWD_2024.length} CPWD rate entries for ${RATE_YEAR}...`);

  const rows = CPWD_2024.map((entry) => ({
    state: entry.state,
    state_normalized: entry.state.toLowerCase().trim(),
    zone: entry.zone,
    construction_type: entry.construction_type,
    rate_per_sqft_paise: entry.rate_per_sqft_paise,
    rate_year: RATE_YEAR,
    source_url: 'https://cpwd.gov.in/Publication/PAR2024.pdf',
  }));

  const { error } = await supabase
    .from('crux_cpwd_cache')
    .upsert(rows, { onConflict: 'state_normalized,zone,construction_type,rate_year' });

  if (error) {
    console.error('CPWD seed failed:', error.message);
    process.exit(1);
  }

  console.log(`✓ Seeded ${CPWD_2024.length} CPWD rate entries successfully.`);

  const { count, error: countErr } = await supabase
    .from('crux_cpwd_cache')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error('Verification failed:', countErr.message);
  } else {
    console.log(`✓ Total rows in crux_cpwd_cache: ${count}`);
  }
}

seed().catch((err) => {
  console.error('Seed script error:', err);
  process.exit(1);
});
