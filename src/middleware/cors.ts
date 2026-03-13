import cors from "cors";
import { env } from "../config/env";

/**
 * CORS middleware — allows requests only from the configured FRONTEND_URL.
 */
export const corsMiddleware = cors({
  origin: env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-internal-secret"],
  credentials: true,
  maxAge: 86400, // 24 h preflight cache
});
