import { z } from "zod";
import { upsertLead } from "./leads";
import { createEarlyAccessRequest } from "./early-access";

const earlyAccessSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  investment_range: z.string(),
  city: z.string(),
  intent_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  notes: z.string().optional(),
});

export async function joinWaitlist(data: z.infer<typeof earlyAccessSchema>) {
  const validatedData = earlyAccessSchema.parse(data);

  const leadId = await upsertLead(
    validatedData.email,
    validatedData.name,
    "EARLY_ACCESS"
  );

  await createEarlyAccessRequest(
    leadId,
    validatedData.investment_range,
    validatedData.intent_level,
    validatedData.city,
    validatedData.notes
  );

  return { ok: true, leadId: leadId };
}
