import { z } from 'zod'
import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../modules/crux/shared/errors'

// ── Reusable field validators ────────────────────────────────────

export const UUIDSchema = z.string().uuid('Invalid ID format')

export const AddressSchema = z
  .string()
  .min(5, 'Address too short')
  .max(500, 'Address too long')
  .regex(/^[^<>{}[\]\\]*$/, 'Address contains invalid characters')
  .transform(s => s.trim())

export const ShareTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,16}$/, 'Invalid share token format')

export const PropertyIngestionSchema = z.object({
  address: AddressSchema,
})

export const LensSessionSchema = z.object({
  property_id: UUIDSchema,
})

export const LensMessageSchema = z.object({
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long (max 2000 characters)')
    .transform(s => s.trim()),
})

// ── Middleware factories ──────────────────────────────────────────

export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const message = result.error.issues
        .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
        .join('; ')
      return next(new AppError(400, 'VALIDATION_ERROR', message))
    }
    req.body = result.data
    next()
  }
}

export function validateParam(paramName: string, schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params[paramName])
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR',
        `Invalid ${paramName}: ${result.error.issues[0]?.message}`))
    }
    next()
  }
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const message = result.error.issues
        .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
        .join('; ')
      return next(new AppError(400, 'VALIDATION_ERROR', message))
    }
    req.query = result.data as typeof req.query
    next()
  }
}
