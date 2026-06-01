import cors from 'cors'
import { env } from '../config/env'

const ALLOWED_ORIGINS = [
  env.FRONTEND_URL,
  'https://crux.comfhutt.com',
  'https://comfhutt.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
]

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400,
})
