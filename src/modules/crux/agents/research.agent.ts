import type { ResearchRunInput } from '../shared/types'
import { defaultResearchService } from '../research'

export async function runResearch(input: ResearchRunInput) {
  return defaultResearchService.runResearch(input)
}

export async function getLatestResearch(propertyId: string) {
  return defaultResearchService.getLatestResearch(propertyId)
}
