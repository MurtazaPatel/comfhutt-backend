export interface ApiError {
  code: string;        // e.g. "CRUX_001", "AUTH_001"
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    timestamp: string;
    version: string;
    requestId: string;
  };
}
