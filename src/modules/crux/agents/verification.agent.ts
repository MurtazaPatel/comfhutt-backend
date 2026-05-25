import type { VerificationRunInput } from '../shared/types'
import { defaultVerificationService } from '../verification'

export async function runVerification(input: VerificationRunInput) {
  return defaultVerificationService.runVerification(input)
}

export async function getLatestVerification(propertyId: string) {
  return defaultVerificationService.getLatestVerification(propertyId)
}
