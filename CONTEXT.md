
Yes, but I would not turn the current fetcher into one big free-form LLM crawler.

The right move is to evolve CRUX from a source fetcher into an evidence acquisition and verification layer. That gives you smarter research without losing trust.

Short view

Keep this principle:

deterministic systems collect facts
LLMs interpret, normalize, compare, and fill structured gaps
scoring remains mostly deterministic
every customer-facing claim must point to evidence, freshness, and confidence
If you want a quality product, optimize for groundedness, traceability, and abstention when unsure, not “maximum intelligence”.

What I would build

API Fetcher
Keep the current fetcher pattern for structured providers.
Government APIs, Maps, court APIs, registries, market feeds.
This remains deterministic and parallel.
Research Agent
Add a separate LLM-backed research worker, not inside the raw fetcher functions.
Its job is:
search the web
inspect trusted documents
extract facts into a strict schema
attach source URLs, snippets, timestamps, and confidence
It should never directly write score inputs as plain text.
It should only output structured evidence objects.
Document Agent
Separate from web research.
Handle:
brochures
title docs
RERA docs
court PDFs
sanction letters
occupancy/completion docs
Use OCR/parser + chunking + retrieval + extraction.
Again, output structured evidence, not narrative.
Verification Agent
This is the out-of-the-box part that matters most.
After research finds claims, a second verifier checks:
is the source authoritative?
is the claim current?
is it contradicted elsewhere?
is it directly about this property or just the locality/developer?
This agent can downgrade or reject weak claims.
Scoring Agent
Keep deterministic scoring as the base.
Do not let the LLM freely rewrite weights every request.
Instead let it produce bounded adjustments inside a policy envelope.
Example:

base location weight = 0.30
LLM may suggest +0.02 because this is a litigation-heavy under-construction asset
but only within allowed limits, and only with cited evidence
That is much safer than “LLM decides the weighting”.

Best architecture for this repo

I would evolve the current CRUX flow like this:

Property
  -> Ingestion
  -> Deterministic API Fetcher
  -> Web Research Agent
  -> Document Research Agent
  -> Evidence Verifier / Contradiction Checker
  -> Evidence Store
  -> Deterministic Scoring Core
  -> Bounded LLM Weight Adjuster
  -> Final Score + Confidence + Citations
  -> Lens / Report / Card / Watch
What each new layer should output

Make every agent return structured evidence like:

type EvidenceItem = {
  entity_type: "property" | "developer" | "locality" | "market" | "legal";
  entity_id: string;
  claim_type: string;
  claim_value: string | number | boolean | object;
  source_type: "api" | "gov_pdf" | "web" | "uploaded_doc";
  source_url?: string;
  source_title?: string;
  excerpt?: string;
  observed_at: string;
  freshness_expires_at?: string;
  confidence: number; // 0..1
  verification_status: "verified" | "weak" | "contradicted" | "unverified";
  supporting_sources: string[];
  contradicting_sources: string[];
};
This is the real foundation for a trustworthy research product.

What I strongly recommend against

Don’t let the fetcher agent browse randomly and directly affect score inputs.
too hard to audit
too easy to hallucinate or overfit to bad sources
Don’t let scoring weights be fully LLM-controlled.
that makes the product unstable
same property can score differently for unclear reasons
impossible to defend in high-trust use cases
Don’t mix raw research text with scoring logic.
first normalize into evidence
then score from evidence
How to use LLMs intelligently in scoring without losing determinism

Use a two-part score:

Base score
fully deterministic
from APIs, documents, structured evidence
Contextual adjustment
LLM proposes small bounded deltas
only for specific categories
must cite evidence items
must pass rule checks
Example policy:

no category weight can move more than +/- 0.03
total weights must normalize to 1.0
legal and fraud-risk categories can only increase on verified negative evidence
web-only evidence cannot shift score more than 0.01
uploaded official docs can shift more than public blogs
That gives you intelligence without chaos.

Creative ideas that would make this exceptional

Evidence graph
Build a property evidence graph instead of flat JSON.
Nodes:
property
developer
project
locality
legal case
document
market report
Edges:
developed_by
located_in
mentioned_in
contradicted_by
verified_by
This makes explainability far stronger.

Contradiction-first research
Most systems search for supporting info.
Better: have one agent search for positive evidence and another search for disconfirming evidence.
Final answer improves because it survives adversarial checking.
Freshness-aware truth model
Not all data ages equally.
AQI may expire in hours.
litigation data maybe weekly.
market reports monthly.
brochures stale quickly.
weight evidence by freshness decay.
Source reputation scoring
Give each source family a trust score.
Government record > registered filing > company website > newspaper > real estate portal > blog.
LLM can use this but not override it.
Claim-level confidence
Don’t just give one overall confidence.
Give:
location confidence
legal confidence
developer confidence
market confidence
Abstention engine
High-quality products say “unknown” when needed.
If evidence is thin or contradictory, CRUX should refuse to overstate.
Silent background enrichment
User asks for a score.
Return fast deterministic result first.
Then run deeper research asynchronously.
Update Lens/report/card when enrichment completes.
This is how you get both speed and depth.

How I’d phase implementation

Phase 1

Add EvidenceItem schema
Add web_research_evidence and document_evidence tables
Add verifier pass
Keep scoring unchanged, but show evidence in Lens/report
Phase 2

Add bounded LLM scoring adjustments
only small deltas
only with citations
log every adjustment
Phase 3

Add document RAG
uploaded property docs
official PDF ingestion
claim extraction
Phase 4

Add background enrichment jobs
watch-triggered re-research
contradiction alerts
score drift explanations
How this fits your current repo well

Your current repo already has the right skeleton:

fetcher.agent.ts can stay the structured source collector
add a new research.agent.ts
add a new verification.agent.ts
scoring.agent.ts stays deterministic core
add a weight-adjustment.agent.ts or just a bounded module inside scoring
report.agent.ts becomes much better because it can cite real evidence items
lens.agent.ts can expose “why do we believe this?” with evidence links
So the architecture becomes deeper, but still clean.

My strongest recommendation

If your goal is “perfect and accurate data-backed answers”, the product should be designed around this rule:

No high-impact customer statement without evidence provenance.

That means every important output should carry:

source
timestamp
confidence
verification status
whether it came from API, document, or open web
That will matter more than adding more “agent magic”.

My final opinion

Your instinct is right:

yes, add an LLM-backed research layer
yes, add document intelligence
yes, let the score become context-aware
But do it as an evidence system, not as a free-form autonomous agent.

The winning design is:

deterministic facts first
research agents as evidence producers
verifier agent as truth filter
scoring mostly deterministic
LLM adjustments small, bounded, explainable
customer answers citation-first
That is how CRUX becomes a serious intelligence product instead of just an impressive demo.

If you want, I can next design the exact upgraded CRUX architecture for this repo:

new agents
new tables
new execution flow
prompt schemas
evidence schemas
how Lens/report/scoring should change end-to-end.




11:35 AM
ok now this is something we can build, now your task is to completely implement these agents from start to end in the repo. And one last question before we proceed futher, why are we not using langgraph or crew ai here but typescript function calling and is it better to use this typescript function calling rather than these frameworks ?
11:43 AM

Yes. For this repo and this product, I would not switch to CrewAI, and I would not start with LangGraph as the core runtime.

Short answer

TypeScript + direct function calling is the better choice right now
LangGraph becomes useful later if CRUX grows into long-running, branching, resumable workflows
CrewAI is the least suitable for this product’s core scoring path
Why TypeScript function calling is better here

In simple terms:

CRUX is a trust product
trust products need control, traceability, determinism, and debugging
raw framework-driven agent loops add abstraction before you actually need it
Right now your system is:

Express
TypeScript
Supabase
deterministic scoring
tool-calling around clear backend services
That is already the right shape.

So instead of:

“AI framework first, business logic second”
you want:

“business logic first, AI orchestration on top”
That is exactly what direct TS orchestration gives you.

Why not CrewAI

CrewAI is good when you want:

role-based agents
looser delegation
agent personas collaborating
faster prototyping of multi-agent behavior
But for CRUX, that is not the main problem.

CRUX needs:

evidence normalization
source verification
bounded scoring adjustments
confidence accounting
compliance-safe outputs
auditable reasoning
CrewAI is weaker for that because it tends to push you toward:

freer agent interactions
less explicit state control
more prompt-level behavior than system-level guarantees
So for CRUX core:

CrewAI: no
maybe only for experimental research sandboxes, not production scoring
Why not LangGraph right now

LangGraph is much better than CrewAI for a serious system like this. It helps when you need:

durable workflows
checkpointing
resumability
branching/retry logic
human-in-the-loop review
explicit graph state
long-running background jobs
That is real value.

But if you adopt it too early, you pay a cost:

more runtime complexity
more mental overhead
graph abstraction before the workflow has stabilized
slower iteration while the product is still changing fast
And your workflow is still evolving. You are still deciding:

what evidence schema should be
what research agents exist
how verification works
how scoring adjustments are bounded
what runs synchronously vs asynchronously
So today, LangGraph is probably premature infrastructure.

What I would do instead

I would build the next version in typed TypeScript orchestration, but in a LangGraph-compatible way.

Meaning:

Keep each agent/module separate
api-fetcher
web-research-agent
document-agent
verification-agent
scoring-core
weight-adjustment-agent
Define an explicit shared state object
property
evidence items
verification results
source freshness
conflicts
score inputs
score outputs
Persist execution artifacts in DB
evidence tables
verification tables
run logs
scoring decisions
LLM adjustment logs
Build the orchestration as plain TS now
easy to debug
easy to test
easy to patch
Then later, if needed, you can move that orchestration into LangGraph with much less pain.

So is TS function calling “better”?

For current CRUX: yes.

For future CRUX at larger complexity: maybe not forever.

My recommendation:

Now: TypeScript function calling and explicit orchestration
Later: maybe LangGraph for background research, verification, and watch-triggered re-analysis
Never for core scoring path: CrewAI
Best architecture choice for your roadmap

Use this rule:

Core truth path: plain TypeScript orchestration
High-trust scoring path: deterministic services + bounded LLM calls
Long-running research pipelines: possibly LangGraph later
Loose multi-agent roleplay systems: avoid for production CRUX
In interview-ready phrasing

“I chose direct TypeScript orchestration over LangGraph or CrewAI because CRUX is a high-trust intelligence system, not an agent demo. I need deterministic scoring, explicit state control, evidence traceability, and debuggable failure handling. LangGraph may become useful later for durable multi-step workflows, but CrewAI is too loose for the core decision path.”

If you want, next I’ll start the actual implementation and do it in the right order:

add evidence schema and tables
add research + verification agents
add bounded scoring adjustment layer
wire Lens and Report to evidence-backed answers
add background enrichment hooks for future Watch workflows




11:44 AM
ok first of all plan the whole implementation of the first agent but not everything at once okay and after implementing and testing perfectly the agent that you are implementing then only move on to next agent and again plan and implement end to end and also remember this sequence for other chats too, free up the old context if required. but implement it perfectly in the repo, also commit everything before editing anything in the repo. start from first
11:50 AM

I’m grounding this first in the current repo state and the existing CRUX agent boundaries so the first-agent plan is anchored to the code we actually have, not just the idea.


Explored 1 search, 1 list, ran 2 commands
The repo is not clean right now: there are three untracked files, including the interview playbook I added earlier. Before any implementation later, we’ll need an explicit pre-edit commit policy because you asked for committing before touching the repo. I’m checking the best insertion point for the “first agent” next so I can recommend the right sequence.


Explored 4 files
The cleanest “first agent” in this repo is not modifying fetcher.agent.ts directly first. The best first step is a new Research Evidence Agent that sits beside the existing fetcher, produces structured evidence, and can later feed verification and bounded score adjustment without destabilizing the deterministic core. Two implementation decisions will materially change that plan, and one repo-state decision matters before any later implementation.


Asked 3 questions
Good. That locks the first slice as a new Research Evidence Agent with web + uploaded/local documents as inputs, while preserving the current deterministic fetcher. One important constraint before I finalize the plan: for the first implementation slice, I need to know whether this agent should only build the evidence layer end-to-end, or also be wired into customer-facing CRUX flows immediately. Also, cross-chat memory is not something I can guarantee by itself, so the reliable way to preserve your “one-agent-at-a-time, commit before edits” rule is to encode it in the repo during implementation as a small engineering protocol doc or commit message trail.


Asked 3 questions
I’ve got the product decisions that actually shape the first slice. I’m doing one last feasibility pass on local document-processing support so the plan is implementation-complete for this repo, not generic architecture advice.


Explored 1 file, 2 lists
I need one implementation-feasibility check before locking the plan: whether the current Gemini SDK in this repo exposes a usable grounding/search tool, or whether the first agent should be designed around pluggable research providers with a stubbed/default adapter. That decides whether the first slice is buildable cleanly without introducing a brand-new external search dependency immediately.


Explored 1 file, 1 search, ran 1 command
Worked for 3m 18s
The SDK search didn’t surface cleanly through a quick grep, but the repo only has plain @google/generative-ai wired today and no existing search-provider abstraction. I’m going to lock the first-agent plan around a provider-adapter interface with one default Gemini analysis adapter and one pluggable web-source adapter, so implementation doesn’t get blocked on a hard dependency decision later.


Asked 1 question
Plan





First Slice Plan: CRUX Research Evidence Agent
Summary
Implement the first new agent as a standalone Research Evidence Agent beside the current deterministic fetcher, not inside it. This slice will:

preserve the current score path unchanged,
add structured web + local/server document evidence collection,
persist research runs and normalized evidence,
expose evidence through Lens and Report,
add a small repo protocol note so future chats can continue the “one-agent-at-a-time, commit-before-edits, test-before-next-agent” sequence from repo state instead of relying on chat memory.
Before any code changes in the later implementation phase:

create a baseline pre-edit commit that includes the current untracked repo files,
then implement only this first agent end-to-end,
only after tests pass do we plan the next agent.
Key Changes
1. Baseline and sequencing protocol
First implementation step is a baseline commit containing the current untracked files so the repo is clean before the first agent work begins.
Add a small repo-local protocol note documenting:
implement one agent at a time,
do not start the next agent until the current one is fully tested,
always commit before beginning the next implementation slice.
This protocol note is the persistence mechanism for future chats.
2. New evidence model and persistence
Add a new CRUX research subsystem with durable tables and shared types for:

research runs
per property
inputs: seed URLs, document paths, force refresh, initiating surface
status: queued/running/success/partial_failed/failed
provider metadata, latency, expiry
document inputs
local/server file path reference
file type
parse status
content hash
extraction metadata
evidence items
property_id, run_id
domain: property | developer | locality | market | legal | environment
source kind: web | document
authority tier: official | primary | secondary | unknown
claim text
normalized claim payload JSON
source title / URL / path
excerpt
observed_at / freshness_expires_at
confidence
status: accepted | weak | rejected
rejection reason when filtered out
Extend CRUX shared types and agent log typing to include research.
Defaults for this first slice:

no vector DB
no RAG index
no verifier agent yet
evidence is normalized and filtered in the research layer itself using deterministic rules plus bounded LLM extraction
3. Research agent runtime
Add a new module set for the first agent:

research orchestrator
entrypoint: run research for one property
checks research-run cache/TTL before recomputing
gathers deterministic context from property row
runs web and document collection in parallel
merges, filters, deduplicates, persists evidence
provider adapter interface
pluggable provider contract so search strategy can evolve later without rewriting the agent
first slice uses:
a conservative authoritative web adapter
a Gemini extraction/summarization adapter
authoritative web adapter
no broad consumer web crawl in v1
operates on:
explicit seed_urls passed to the run request,
deterministic allowlisted URL candidates derived from property city/state/developer context when available
only fetches pages from allowlisted authority tiers
stores raw fetch metadata and extracted text snippet
document adapter
supports backend-accessible local/server file paths first
required file support: .txt, .md, .json
supported when bundled parsers are available: .pdf, .docx
parse failures do not fail the whole run; they are recorded and the run can still complete partially
Gemini extraction step
never free-form narrative
input: fetched text/document chunks + property context
output: strict JSON evidence items only
must include claim, evidence excerpt, source metadata, authority tier proposal, and confidence
deterministic filtering
reject evidence with no source attribution
reject weak generic locality/property claims
reject stale items beyond per-domain freshness thresholds
dedupe semantically identical claims by normalized claim hash
keep only accepted evidence for downstream read paths
cache policy
latest successful research run per property cached with TTL
first slice default TTL: 24 hours for web evidence, 7 days for document-only evidence unless force refresh is requested
4. Public interfaces and integration
Add public/backend interfaces for the first slice:

new protected route: POST /api/crux/research/:property_id
body:
seed_urls?: string[]
document_paths?: string[]
force_refresh?: boolean
intent?: yield | appreciation | balanced
behavior:
run or reuse latest research
return run summary + accepted evidence summary
new protected route: GET /api/crux/research/:property_id
returns latest cached research run and accepted evidence items
Lens integration
add triggerResearch tool
add research to module_result SSE type
when a recent successful research run exists, inject a compact evidence summary into the Lens system context
when none exists, Lens remains functional and can trigger research on demand
Report integration
report generation reads latest accepted research evidence if available
report prompt includes an additional structured evidence block
extend report output/persistence with:
research_highlights: string[]
citations: { claim, source_title, source_url, authority_tier, observed_at }[]
report still works without research; it simply omits research-backed sections
Scoring remains unchanged in this slice
no research evidence changes the numeric score yet
no LLM weight adjustment yet
5. Prompt and policy design for the first agent
Use two bounded prompts only:

evidence extraction prompt
goal: extract verifiable property/developer/locality/legal/market/environment claims
output: strict JSON schema only
must abstain on unsupported claims
must prefer explicit facts over interpretation
evidence summarization prompt for Lens/Report
goal: compress accepted evidence into short factual highlights with citations
no recommendations
no score changes
must say when evidence is insufficient or conflicting
Research policy defaults:

authoritative sources first
no unsupported speculation
prefer abstention over weak evidence
every customer-visible research-backed statement must map to at least one persisted evidence item
Test Plan
Add automated tests for the first slice and only consider the agent complete when these pass:

unit tests
document parser selection by extension
evidence normalization and deduplication
stale evidence rejection
authority-tier filtering
research-run cache reuse and force refresh behavior
agent tests
web adapter accepts allowlisted URLs and rejects non-allowlisted ones
Gemini extraction result parsing rejects malformed JSON
partial document parse failure still yields partial_failed run with accepted remaining evidence
integration tests
POST /api/crux/research/:property_id creates a run and persists evidence
GET /api/crux/research/:property_id returns latest accepted evidence
Lens triggerResearch returns a module_result.type = research
Lens prompt path includes cached research summary when present
Report includes research_highlights and citations when evidence exists
Report still succeeds when no research exists
build/contract checks
typecheck passes
build passes
OpenAPI/spec/types updated to include research endpoints and report additions
manual acceptance scenarios
property with no documents and no seed URLs returns a safe, low-evidence result
property with one authoritative URL yields accepted cited evidence
property with one valid PDF/doc path yields accepted evidence
mixed good/bad document paths still returns partial research instead of total failure
Assumptions and Defaults
First agent = Research Evidence Agent
Inputs for v1 = authoritative web + local/server file paths
First slice integration = evidence layer plus Lens/Report read path
No score formula change in this slice
No LangGraph/CrewAI adoption in this slice
Provider strategy = adapter interface with conservative default, not a heavy new search dependency
Cross-chat continuity will be preserved by a repo protocol note and commit history, not by assuming chat memory
