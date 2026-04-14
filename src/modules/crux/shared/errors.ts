// CRUX Error Codes — maps to API contract Section 6.8
// Usage: throw new AppError(CRUX_ERRORS.PROPERTY_NOT_FOUND.status, CRUX_ERRORS.PROPERTY_NOT_FOUND.code)

export const CRUX_ERRORS = {
  // Property
  PROPERTY_NOT_FOUND: {
    status: 404,
    code: 'PROPERTY_NOT_FOUND',
    message: 'Property not found. Please check the property ID.',
  },
  GEOCODING_FAILED: {
    status: 422,
    code: 'GEOCODING_FAILED',
    message: 'Could not geocode this address. Please provide a more specific address.',
  },
  INVALID_PROPERTY_TYPE: {
    status: 422,
    code: 'INVALID_PROPERTY_TYPE',
    message: 'Invalid property type provided.',
  },

  // Scoring
  SCORE_COMPUTATION_FAILED: {
    status: 500,
    code: 'SCORE_COMPUTATION_FAILED',
    message: 'Score computation failed. Please try again.',
  },
  DEGRADED_DATA: {
    status: 200,
    code: 'DEGRADED_DATA',
    message: 'Score computed with limited data. Confidence is reduced.',
  },

  // Report
  REPORT_GENERATION_FAILED: {
    status: 500,
    code: 'REPORT_GENERATION_FAILED',
    message: 'Report generation failed. Please try again.',
  },

  // Lens
  SESSION_NOT_FOUND: {
    status: 404,
    code: 'SESSION_NOT_FOUND',
    message: 'Lens session not found or expired.',
  },
  SESSION_EXPIRED: {
    status: 410,
    code: 'SESSION_EXPIRED',
    message: 'This session has expired. Please start a new session.',
  },
  SESSION_MESSAGE_LIMIT: {
    status: 429,
    code: 'SESSION_MESSAGE_LIMIT',
    message: 'Message limit reached for this session.',
  },

  // Watch
  WATCH_CREDITS_EXHAUSTED: {
    status: 402,
    code: 'WATCH_CREDITS_EXHAUSTED',
    message: 'No Watch credits remaining.',
  },
  WATCH_CREDITS_NOT_FOUND: {
    status: 404,
    code: 'WATCH_CREDITS_NOT_FOUND',
    message: 'Watch credits record not found for this user.',
  },

  // Card
  CARD_NOT_FOUND: {
    status: 404,
    code: 'CARD_NOT_FOUND',
    message: 'Analysis card not found or expired.',
  },

  // Agent
  AGENT_TIMEOUT: {
    status: 504,
    code: 'AGENT_TIMEOUT',
    message: 'Agent timed out. Please try again.',
  },
  AGENT_MAX_ITERATIONS: {
    status: 500,
    code: 'AGENT_MAX_ITERATIONS',
    message: 'Agent exceeded maximum iterations.',
  },

  // General
  RATE_LIMIT_EXCEEDED: {
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please slow down.',
  },
  UNAUTHORIZED: {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication required.',
  },
} as const;

export type CruxErrorCode = keyof typeof CRUX_ERRORS;

// Helper — throws using your existing AppError pattern
// Usage: throwCruxError('PROPERTY_NOT_FOUND')
// Requires AppError to exist in middleware/errorHandler
export function getCruxError(code: CruxErrorCode) {
  return CRUX_ERRORS[code];
}
