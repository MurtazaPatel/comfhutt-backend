import { generate, safeJsonParse, safeJsonExtractArray } from '../../src/lib/llm'

async function main() {
  console.log('=== Testing Research Extraction (DeepSeek-R1 reasoning) ===\n')
  
  const systemPrompt = `You are the CRUX Research Evidence Extractor. Extract factual information from source text as JSON.
Output ONLY a valid JSON array. Each object must have: domain, claim_text, normalized_claim, confidence.`

  const prompt = `PROPERTY: Shivalik Platinum, Bodakdev, Ahmedabad, Gujarat 380054
DEVELOPER: Shivalik Group
SOURCE: Shivalik Group website

SOURCE TEXT:
Shivalik Group has developed 15+ projects in Ahmedabad including Shivalik Platinum 
in Bodakdev. The developer received RERA registration MAA07768. Ahmedabad metro 
Line 2 runs along SG Highway near Bodakdev with stations at Thaltej and Vastrapur. 
Property prices in West Ahmedabad show 8% annual appreciation. Construction quality 
ratings for Shivalik projects average 4.2/5 from buyer reviews.

Extract ALL factual claims as a JSON array.`

  console.log('→ Calling DeepSeek-R1 (strategy: reasoning)...\n')
  const t0 = Date.now()
  const raw = await generate({ strategy: 'reasoning', systemInstruction: systemPrompt, prompt, temperature: 0.1, maxOutputTokens: 4096 })
  console.log(`← Response in ${((Date.now()-t0)/1000).toFixed(1)}s, ${raw.length} chars\n`)
  
  console.log('RAW RESPONSE (first 1500 chars):')
  console.log(raw.slice(0, 1500))
  console.log('\n---\n')
  
  const parsed = safeJsonParse<unknown>(raw)
  if (parsed) {
    console.log('✅ safeJsonParse SUCCESS, isArray:', Array.isArray(parsed), 'items:', Array.isArray(parsed) ? (parsed as any[]).length : 'N/A')
  } else {
    console.log('❌ safeJsonParse FAILED')
    const arr = safeJsonExtractArray(raw)
    console.log('   safeJsonExtractArray items:', arr.length)
    if (arr.length > 0) {
      console.log('   First item:', JSON.stringify(arr[0]).slice(0, 300))
    }
  }
}

main().catch(err => console.error('ERROR:', err))
