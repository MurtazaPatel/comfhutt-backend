# CRUX API Fixtures

Realistic mock responses for all CRUX endpoints.
Frontend builds against these. Backend E2E tests validate against this shape.

## Canonical test property
- **property_id**: `ac86df83-6931-416d-83d0-da578f61e3e0`
- **address**: Koregaon Park, Pune, Maharashtra 411001
- **score_composite**: 61
- **confidence_score**: 0.5
- **share_token**: `WB5zh4cIXbiB`

## Files

| File | Endpoint | Source |
|------|----------|--------|
| `property.json` | GET /api/crux/property/:id | Live backend ✅ |
| `score.json` | GET /api/crux/score/:property_id | Live backend ✅ |
| `report.json` | GET /api/crux/report/:property_id | Invented — see note below |
| `card.json` | POST /api/crux/card/:property_id | Live backend ✅ |
| `lens-session.json` | POST /api/crux/lens/session | Live backend ✅ |
| `lens-stream.txt` | POST /api/crux/lens/:session_id/message (SSE) | Invented (SSE format confirmed) |
| `lens-stream-with-module-result.txt` | SSE with inline Cast module_result | Invented |
| `lens-history.json` | GET /api/crux/lens/:session_id/history | Live backend shape ✅ |
| `watch-credits.json` | GET /api/crux/watch/credits | Invented — requires auth |
| `watch-register.json` | POST /api/crux/watch/:property_id | Invented — requires auth |
| `error-examples.json` | All standard error shapes | Live backend ✅ (401 confirmed) |

## Known issues (as of Prompt 14, 2026-04-22)

### report endpoint returns 500
`GET /api/crux/report/:property_id` returns `{"error":"Property not found."}` (HTTP 500).

Root cause: `report.agent.ts:113` queries `crux_properties` with `.eq('property_id', propertyId)` but the column in that table is `id`, not `property_id`. Fix: change the query to `.eq('id', propertyId)`.

`report.json` contains a realistic invented fixture matching the `CruxReportRow` schema from `src/modules/crux/report/report.service.ts`.

### card_data.summary / risk_flags / positive_signals are null/empty
Because report generation is broken, the card snapshot captures `summary: null`, `risk_flags: []`, `positive_signals: []`. The `card.json` fixture reflects this real backend state. Once the report endpoint is fixed, these fields will be populated.

### lens SSE stream returned error
The live Lens SSE stream returned `LENS_ERROR` during Phase 0 testing. The SSE fixture files use invented content matching the confirmed SSE frame format `{"delta":"...","done":bool,"module_result":null|{...}}`.

## Score breakdown shape (real — flat, not nested)
```json
{
  "risk_composite": 50,
  "legal_compliance": 60,
  "market_valuation": 80,
  "structural_physical": 50,
  "developer_reliability": 50,
  "location_intelligence": 66
}
```

## SSE stream format
```
data: {"delta":"text chunk","done":false,"module_result":null}
data: {"delta":"","done":false,"module_result":{"type":"cast","data":{...}}}
data: {"delta":"","done":true,"module_result":null}
```

## Base URL
- Local: `http://localhost:8080/api`
- Production: `https://crux.comfhutt.com/api`

## Notes
- All endpoints except Watch work without auth (anonymous)
- Watch requires Supabase Auth JWT in `Authorization: Bearer <token>` header
- SSE streams require `--no-buffer` flag in curl
- Local port is **8080**, not 3000
