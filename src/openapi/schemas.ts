export const components = {
  schemas: {
    ApiError: {
      type: 'object',
      required: ['code', 'message', 'statusCode'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        statusCode: { type: 'number' },
        details: { type: 'object' },
      },
    },
    AuthMeResponse: {
      type: 'object',
      required: ['user'],
      properties: {
        user: { $ref: '#/components/schemas/CruxUser' },
      },
    },
    CruxUser: {
      type: 'object',
      required: ['id', 'email', 'isPro', 'watchCredits', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        isPro: { type: 'boolean' },
        watchCredits: { type: 'number' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
    },
    ScoreRequest: {
      type: 'object',
      required: ['propertyAddress', 'city', 'pincode', 'lifecycleStage', 'investorIntent'],
      properties: {
        propertyAddress: { type: 'string' },
        city: { type: 'string' },
        pincode: { type: 'string' },
        lifecycleStage: {
          type: 'string',
          enum: ['near_completion', 'delivered', 'established', 'mature'],
        },
        investorIntent: { type: 'string', enum: ['yield', 'appreciation', 'balanced'] },
        lat: { type: 'number' },
        lng: { type: 'number' },
      },
    },
    ParameterScore: {
      type: 'object',
      required: ['name', 'score', 'weight', 'source', 'confidence', 'lastUpdated'],
      properties: {
        name: { type: 'string' },
        score: { type: 'number' },
        weight: { type: 'number' },
        source: { type: 'string' },
        confidence: { type: 'number' },
        lastUpdated: { type: 'string' },
      },
    },
    ScoreCategory: {
      type: 'object',
      required: ['name', 'score', 'parameters'],
      properties: {
        name: { type: 'string' },
        score: { type: 'number' },
        parameters: { type: 'array', items: { $ref: '#/components/schemas/ParameterScore' } },
      },
    },
    ValuationMethod: {
      type: 'object',
      required: ['method', 'fairValueMin', 'fairValueMax', 'confidence'],
      properties: {
        method: { type: 'string', enum: ['income_capitalization', 'sales_comparable', 'replacement_cost'] },
        fairValueMin: { type: 'number' },
        fairValueMax: { type: 'number' },
        confidence: { type: 'number' },
      },
    },
    MarketValuation: {
      type: 'object',
      required: ['weightedFairValueMin', 'weightedFairValueMax', 'methodVarianceFlag', 'methods'],
      properties: {
        weightedFairValueMin: { type: 'number' },
        weightedFairValueMax: { type: 'number' },
        methodVarianceFlag: { type: 'boolean' },
        methods: { type: 'array', items: { $ref: '#/components/schemas/ValuationMethod' } },
        vsListedPricePercent: { type: 'number' },
      },
    },
    CruxScoreResponse: {
      type: 'object',
      required: ['scoreId', 'shareToken', 'compositeScore', 'macroMarketCycle', 'categories', 'valuation', 'reportSummary', 'confidenceScore', 'methodologyVersion', 'createdAt'],
      properties: {
        scoreId: { type: 'string' },
        shareToken: { type: 'string' },
        compositeScore: { type: 'number' },
        macroMarketCycle: {
          type: 'string',
          enum: ['growth', 'consolidation', 'correction', 'recovery'],
        },
        categories: { type: 'array', items: { $ref: '#/components/schemas/ScoreCategory' } },
        valuation: { $ref: '#/components/schemas/MarketValuation' },
        reportSummary: { type: 'string' },
        confidenceScore: { type: 'number' },
        methodologyVersion: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
    LensMessage: {
      type: 'object',
      required: ['role', 'content', 'timestamp'],
      properties: {
        role: { type: 'string', enum: ['user', 'assistant'] },
        content: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
    LensRequest: {
      type: 'object',
      required: ['scoreId', 'message', 'history'],
      properties: {
        scoreId: { type: 'string' },
        message: { type: 'string' },
        history: { type: 'array', items: { $ref: '#/components/schemas/LensMessage' } },
      },
    },
    LensStreamChunk: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['delta', 'done', 'error'] },
        content: { type: 'string' },
        error: { type: 'string' },
      },
    },
    WatchCreateRequest: {
      type: 'object',
      required: ['propertyAddress', 'city', 'pincode'],
      properties: {
        propertyAddress: { type: 'string' },
        city: { type: 'string' },
        pincode: { type: 'string' },
        lat: { type: 'number' },
        lng: { type: 'number' },
      },
    },
    WatchEntry: {
      type: 'object',
      required: ['watchId', 'userId', 'propertyAddress', 'city', 'pincode', 'alertThreshold', 'isActive', 'createdAt'],
      properties: {
        watchId: { type: 'string' },
        userId: { type: 'string' },
        propertyAddress: { type: 'string' },
        city: { type: 'string' },
        pincode: { type: 'string' },
        lastScoreId: { type: 'string' },
        lastCompositeScore: { type: 'number' },
        alertThreshold: { type: 'number' },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string' },
      },
    },
    WatchListResponse: {
      type: 'object',
      required: ['watches', 'remainingCredits'],
      properties: {
        watches: { type: 'array', items: { $ref: '#/components/schemas/WatchEntry' } },
        remainingCredits: { type: 'number' },
      },
    },
    ReportSection: {
      type: 'object',
      required: ['title', 'content'],
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
      },
    },
    CruxReportResponse: {
      type: 'object',
      required: ['id', 'property_id', 'score_id', 'intent_profile', 'summary', 'category_narratives', 'risk_flags', 'positive_signals', 'research_highlights', 'citations', 'sebi_disclaimer', 'crux_version', 'generated_at', 'ttl_expires_at'],
      properties: {
        id: { type: 'string' },
        property_id: { type: 'string' },
        score_id: { type: 'string' },
        intent_profile: { type: 'string' },
        summary: { type: 'string' },
        category_narratives: {
          type: 'object',
          required: ['legal_title', 'location_quality', 'developer_reliability', 'market_valuation', 'demand_signals'],
          properties: {
            legal_title: { type: 'string' },
            location_quality: { type: 'string' },
            developer_reliability: { type: 'string' },
            market_valuation: { type: 'string' },
            demand_signals: { type: 'string' },
          },
        },
        risk_flags: { type: 'array', items: { type: 'string' } },
        positive_signals: { type: 'array', items: { type: 'string' } },
        research_highlights: { type: 'array', items: { type: 'string' } },
        citations: { type: 'array', items: { $ref: '#/components/schemas/ResearchCitation' } },
        sebi_disclaimer: { type: 'string' },
        crux_version: { type: 'string' },
        generated_at: { type: 'string' },
        ttl_expires_at: { type: 'string' },
      },
    },
    ResearchCitation: {
      type: 'object',
      required: ['claim', 'source_title', 'source_url_or_path', 'authority_tier', 'observed_at'],
      properties: {
        claim: { type: 'string' },
        source_title: { type: 'string' },
        source_url_or_path: { type: 'string' },
        authority_tier: { type: 'string', enum: ['official', 'primary', 'secondary', 'unknown'] },
        observed_at: { type: ['string', 'null'] },
      },
    },
    ResearchEvidenceItem: {
      type: 'object',
      required: ['id', 'run_id', 'property_id', 'domain', 'source_kind', 'authority_tier', 'status', 'claim_text', 'normalized_claim', 'source_title', 'excerpt', 'confidence', 'claim_hash', 'created_at'],
      properties: {
        id: { type: 'string' },
        run_id: { type: 'string' },
        property_id: { type: 'string' },
        domain: { type: 'string', enum: ['property', 'developer', 'locality', 'market', 'legal', 'environment'] },
        source_kind: { type: 'string', enum: ['web', 'document'] },
        authority_tier: { type: 'string', enum: ['official', 'primary', 'secondary', 'unknown'] },
        status: { type: 'string', enum: ['accepted', 'weak', 'rejected'] },
        claim_text: { type: 'string' },
        normalized_claim: { type: 'object' },
        source_title: { type: 'string' },
        source_url: { type: ['string', 'null'] },
        source_path: { type: ['string', 'null'] },
        excerpt: { type: 'string' },
        observed_at: { type: ['string', 'null'] },
        freshness_expires_at: { type: ['string', 'null'] },
        confidence: { type: 'number' },
        rejection_reason: { type: ['string', 'null'] },
        claim_hash: { type: 'string' },
        created_at: { type: 'string' },
      },
    },
    ResearchEvidenceDigest: {
      type: 'object',
      required: ['run_id', 'status', 'accepted_count', 'weak_count', 'rejected_count', 'accepted_items', 'weak_items'],
      properties: {
        run_id: { type: 'string' },
        status: { type: 'string', enum: ['running', 'success', 'partial_failed', 'failed'] },
        accepted_count: { type: 'number' },
        weak_count: { type: 'number' },
        rejected_count: { type: 'number' },
        accepted_items: { type: 'array', items: { $ref: '#/components/schemas/ResearchEvidenceItem' } },
        weak_items: { type: 'array', items: { $ref: '#/components/schemas/ResearchEvidenceItem' } },
      },
    },
    ResearchRun: {
      type: 'object',
      required: ['id', 'property_id', 'status', 'initiated_by_surface', 'provider', 'seed_urls', 'document_paths', 'summary_counts', 'started_at', 'ttl_expires_at', 'created_at'],
      properties: {
        id: { type: 'string' },
        property_id: { type: 'string' },
        status: { type: 'string', enum: ['running', 'success', 'partial_failed', 'failed'] },
        initiated_by_surface: { type: 'string', enum: ['api', 'lens', 'report'] },
        provider: { type: 'string', enum: ['tavily'] },
        seed_urls: { type: 'array', items: { type: 'string' } },
        document_paths: { type: 'array', items: { type: 'string' } },
        summary_counts: { type: 'object' },
        started_at: { type: 'string' },
        completed_at: { type: ['string', 'null'] },
        ttl_expires_at: { type: 'string' },
        last_error: { type: ['string', 'null'] },
        created_at: { type: 'string' },
      },
    },
    ResearchRequest: {
      type: 'object',
      properties: {
        seed_urls: { type: 'array', items: { type: 'string' } },
        document_paths: { type: 'array', items: { type: 'string' } },
        force_refresh: { type: 'boolean' },
        surface: { type: 'string', enum: ['api', 'lens', 'report'] },
      },
    },
    ResearchRunResponse: {
      type: 'object',
      required: ['run', 'digest', 'reused_cache'],
      properties: {
        run: { $ref: '#/components/schemas/ResearchRun' },
        digest: { $ref: '#/components/schemas/ResearchEvidenceDigest' },
        reused_cache: { type: 'boolean' },
      },
    },
    EvidenceVerification: {
      type: 'object',
      required: ['id', 'run_id', 'property_id', 'research_run_id', 'evidence_item_id', 'verification_status', 'verifier_confidence', 'direct_match', 'freshness_ok', 'support_score', 'contradiction_score', 'supporting_evidence_ids', 'contradicting_evidence_ids', 'created_at'],
      properties: {
        id: { type: 'string' },
        run_id: { type: 'string' },
        property_id: { type: 'string' },
        research_run_id: { type: 'string' },
        evidence_item_id: { type: 'string' },
        verification_status: { type: 'string', enum: ['verified', 'contradicted', 'inconclusive', 'stale'] },
        verifier_confidence: { type: 'number' },
        direct_match: { type: 'boolean' },
        freshness_ok: { type: 'boolean' },
        support_score: { type: 'number' },
        contradiction_score: { type: 'number' },
        supporting_evidence_ids: { type: 'array', items: { type: 'string' } },
        contradicting_evidence_ids: { type: 'array', items: { type: 'string' } },
        verification_notes: { type: ['string', 'null'] },
        created_at: { type: 'string' },
      },
    },
    VerifiedEvidenceItem: {
      type: 'object',
      required: ['evidence', 'verification'],
      properties: {
        evidence: { $ref: '#/components/schemas/ResearchEvidenceItem' },
        verification: { $ref: '#/components/schemas/EvidenceVerification' },
      },
    },
    VerificationDigest: {
      type: 'object',
      required: ['run_id', 'research_run_id', 'status', 'verified_count', 'contradicted_count', 'inconclusive_count', 'stale_count', 'verified_items', 'contradicted_items', 'inconclusive_items', 'stale_items'],
      properties: {
        run_id: { type: 'string' },
        research_run_id: { type: 'string' },
        status: { type: 'string', enum: ['running', 'success', 'partial_failed', 'failed'] },
        verified_count: { type: 'number' },
        contradicted_count: { type: 'number' },
        inconclusive_count: { type: 'number' },
        stale_count: { type: 'number' },
        verified_items: { type: 'array', items: { $ref: '#/components/schemas/VerifiedEvidenceItem' } },
        contradicted_items: { type: 'array', items: { $ref: '#/components/schemas/VerifiedEvidenceItem' } },
        inconclusive_items: { type: 'array', items: { $ref: '#/components/schemas/VerifiedEvidenceItem' } },
        stale_items: { type: 'array', items: { $ref: '#/components/schemas/VerifiedEvidenceItem' } },
      },
    },
    VerificationRun: {
      type: 'object',
      required: ['id', 'property_id', 'research_run_id', 'status', 'initiated_by_surface', 'summary_counts', 'started_at', 'ttl_expires_at', 'created_at'],
      properties: {
        id: { type: 'string' },
        property_id: { type: 'string' },
        research_run_id: { type: 'string' },
        status: { type: 'string', enum: ['running', 'success', 'partial_failed', 'failed'] },
        initiated_by_surface: { type: 'string', enum: ['api', 'lens', 'report'] },
        summary_counts: { type: 'object' },
        started_at: { type: 'string' },
        completed_at: { type: ['string', 'null'] },
        ttl_expires_at: { type: 'string' },
        last_error: { type: ['string', 'null'] },
        created_at: { type: 'string' },
      },
    },
    VerificationRequest: {
      type: 'object',
      properties: {
        force_refresh: { type: 'boolean' },
        surface: { type: 'string', enum: ['api', 'lens', 'report'] },
      },
    },
    VerificationRunResponse: {
      type: 'object',
      required: ['run', 'digest', 'reused_cache'],
      properties: {
        run: { $ref: '#/components/schemas/VerificationRun' },
        digest: { $ref: '#/components/schemas/VerificationDigest' },
        reused_cache: { type: 'boolean' },
      },
    },
    CardShareResponse: {
      type: 'object',
      required: ['shareToken', 'shareUrl', 'ogTitle', 'ogDescription', 'compositeScore', 'propertyAddress', 'expiresAt'],
      properties: {
        shareToken: { type: 'string' },
        shareUrl: { type: 'string' },
        ogTitle: { type: 'string' },
        ogDescription: { type: 'string' },
        compositeScore: { type: 'number' },
        propertyAddress: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  },
};

export const paths = {
  '/health': {
    get: {
      operationId: 'healthCheck',
      tags: ['System'],
      security: [],
      responses: {
        '200': { description: 'API is running' },
      },
    },
  },
  '/auth/me': {
    get: {
      operationId: 'getAuthMe',
      tags: ['Auth'],
      summary: 'Get current authenticated user',
      responses: {
        '200': {
          description: 'Authenticated user',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthMeResponse' },
            },
          },
        },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  '/crux/score': {
    post: {
      operationId: 'createScore',
      tags: ['CRUX'],
      summary: 'Score a property across 20+ parameters',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ScoreRequest' },
          },
        },
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CruxScoreResponse' },
            },
          },
        },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '429': { description: 'Rate limited' },
      },
    },
  },
  '/crux/lens': {
    post: {
      operationId: 'lensChat',
      tags: ['CRUX'],
      summary: 'Stream Lens AI chat (SSE)',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LensRequest' },
          },
        },
      },
      responses: {
        '200': {
          description: 'SSE stream of LensStreamChunk events',
        },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  '/crux/watch': {
    get: {
      operationId: 'listWatches',
      tags: ['CRUX'],
      summary: 'List all Watch entries for current user',
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WatchListResponse' },
            },
          },
        },
      },
    },
    post: {
      operationId: 'createWatch',
      tags: ['CRUX'],
      summary: 'Create a Watch entry (costs 1 credit)',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/WatchCreateRequest' },
          },
        },
      },
      responses: {
        '201': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WatchEntry' },
            },
          },
        },
        '402': { description: 'Insufficient Watch credits' },
      },
    },
  },
  '/crux/report/{property_id}': {
    get: {
      operationId: 'getReport',
      tags: ['CRUX'],
      summary: 'Get full CRUX report for a property',
      parameters: [
        {
          in: 'path',
          name: 'property_id',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CruxReportResponse' },
            },
          },
        },
      },
    },
  },
  '/crux/research/{property_id}': {
    get: {
      operationId: 'getResearch',
      tags: ['CRUX'],
      summary: 'Get the latest research run and accepted evidence for a property',
      parameters: [
        {
          in: 'path',
          name: 'property_id',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResearchRunResponse' },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '404': { description: 'No research run found' },
      },
    },
    post: {
      operationId: 'runResearch',
      tags: ['CRUX'],
      summary: 'Run or refresh research evidence for a property',
      parameters: [
        {
          in: 'path',
          name: 'property_id',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ResearchRequest' },
          },
        },
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResearchRunResponse' },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '400': { description: 'Validation error' },
      },
    },
  },
  '/crux/verification/{property_id}': {
    get: {
      operationId: 'getVerification',
      tags: ['CRUX'],
      summary: 'Get the latest verification run and verified evidence for a property',
      parameters: [
        {
          in: 'path',
          name: 'property_id',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerificationRunResponse' },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '404': { description: 'No verification run found' },
      },
    },
    post: {
      operationId: 'runVerification',
      tags: ['CRUX'],
      summary: 'Run or refresh evidence verification for a property',
      parameters: [
        {
          in: 'path',
          name: 'property_id',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/VerificationRequest' },
          },
        },
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerificationRunResponse' },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '400': { description: 'Validation error' },
      },
    },
  },
  '/crux/card/{shareToken}': {
    get: {
      operationId: 'getShareCard',
      tags: ['CRUX'],
      security: [],
      summary: 'Get public share card data (no auth required)',
      parameters: [
        {
          in: 'path',
          name: 'shareToken',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CardShareResponse' },
            },
          },
        },
        '404': { description: 'Card not found or expired' },
      },
    },
  },
};
