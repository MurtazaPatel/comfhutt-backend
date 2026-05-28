import { supabase } from '../../src/lib/db';
import { runResearch } from '../../src/modules/crux/agents/research.agent';
import { env } from '../../src/config/env';

(async () => {
  console.log('FIRECRAWL_URL configured:', env.FIRECRAWL_URL);

  const { data, error: propErr } = await supabase.from('crux_properties').select('*').eq('id', 'ac86df83-6931-416d-83d0-da578f61e3e0').maybeSingle();
  if (propErr) { console.log('Supabase property fetch error:', propErr.message, propErr); return; }
  if (!data) { console.log('Property not found'); return; }

  console.log('Property:', data.address_normalized);

  try {
    console.log('\nStarting research...');
    const t0 = Date.now();
    const result = await runResearch({
      property_id: data.id,
      force_refresh: true,
      surface: 'api',
    });
    console.log(`Research completed in ${Date.now() - t0}ms`);
    console.log('Run row:', JSON.stringify(result.run, null, 2));
    console.log('Status:', result.run.status);
    console.log('Evidence: accepted=' + result.digest.accepted_count + ', weak=' + result.digest.weak_count + ', rejected=' + result.digest.rejected_count);

    for (const ev of [...result.digest.accepted_items, ...result.digest.weak_items].slice(0, 10)) {
      console.log(`  [${ev.domain}] ${ev.status}: "${ev.claim_text.slice(0, 100)}"`);
    }
  } catch (err: unknown) {
    const e = err as { message?: string; stack?: string; code?: string; details?: unknown; hint?: string };
    console.error('RESEARCH ERROR:', e?.message);
    if (e?.code) console.error('CODE:', e.code);
    if (e?.details) console.error('DETAILS:', JSON.stringify(e.details));
    if (e?.hint) console.error('HINT:', e.hint);
    console.error('STACK:', e?.stack?.split('\n').slice(0, 8).join('\n'));
  }
})();