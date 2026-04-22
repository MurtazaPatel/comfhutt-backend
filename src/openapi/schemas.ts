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
  '/crux/report/{scoreId}': {
    get: {
      operationId: 'getReport',
      tags: ['CRUX'],
      summary: 'Get full CRUX report for a score',
      parameters: [
        {
          in: 'path',
          name: 'scoreId',
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
