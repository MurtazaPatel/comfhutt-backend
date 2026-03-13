import { z } from "zod";
import { sendEmail } from "../lib/email";
import { upsertLead, logLeadEvent } from "./leads";
import { supabase } from "../lib/db";

export async function createEarlyAccessRequest(
  leadId: string,
  investmentRange: string,
  intentLevel: string,
  city?: string | null,
  notes?: string | null,
  environment: string = "DEV"
) {
  if (!leadId) {
    throw new Error("createEarlyAccessRequest: leadId is required");
  }

  const { error } = await supabase.rpc("create_early_access_request", {
    _lead_id: leadId,
    _investment_range: investmentRange,
    _intent_level: intentLevel,
    _environment: environment,
    _city: city || null,
    _notes: notes || null,
  });

  if (error) {
    if (error.code === "23505") {
      const customError: Error & { code?: string } = new Error("You have already requested early access.");
      customError.code = "23505";
      throw customError;
    }
    throw new Error(`Error creating early access request: ${error.message}`);
  }
}

const InvestmentIntent = {
  JUST_EXPLORING: "JUST_EXPLORING",
  INVEST_WITHIN_3_MONTHS: "INVEST_WITHIN_3_MONTHS",
  READY_TO_INVEST: "READY_TO_INVEST",
} as const;

const InvestmentRange = {
  BELOW_10K: "BELOW_10K",
  TEN_TO_FIFTY_K: "TEN_TO_FIFTY_K",
  FIFTY_K_TO_TWO_L: "FIFTY_K_TO_TWO_L",
  ABOVE_TWO_L: "ABOVE_TWO_L",
} as const;

const PropertyType = {
  RESIDENTIAL: "RESIDENTIAL",
  COMMERCIAL: "COMMERCIAL",
  MIXED_USE: "MIXED_USE",
} as const;

const earlyAccessSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  name: z.string().max(100, "Name too long").optional().transform(v => v?.trim()),
  investmentIntent: z.nativeEnum(InvestmentIntent).optional().default(InvestmentIntent.JUST_EXPLORING),
  expectedInvestmentRange: z.nativeEnum(InvestmentRange).optional().default(InvestmentRange.BELOW_10K),
  preferredPropertyType: z.nativeEnum(PropertyType).optional(),
  source: z.string().max(50).optional().default("website"),
});

export async function joinEarlyAccess(data: z.infer<typeof earlyAccessSchema>) {
  const startTime = Date.now();
  try {
    const validatedData = earlyAccessSchema.parse(data);

    if (process.env.MOCK_DB === "true") {
       await new Promise(resolve => setTimeout(resolve, 50));
       console.log(`[Waitlist MOCK] Success: ${validatedData.email}`);
       return { success: true };
    }

    // 1. Upsert Lead to get a stable lead_id
    let leadId;
    try {
      leadId = await upsertLead(
        validatedData.email,
        validatedData.name,
        "EARLY_ACCESS"
      );
    } catch (error) {
      console.error("Error upserting lead:", error);
      return { success: false, error: "Could not process your request. Please try again." };
    }

    // 2. Insert into early_access_requests table via RPC
    try {
      await createEarlyAccessRequest(
        leadId,
        validatedData.expectedInvestmentRange,
        validatedData.investmentIntent,
        null, // city
        null // notes
      );
    } catch (error: unknown) {
      // Handle potential duplicate requests if the unique constraint is on lead_id
      if (error instanceof Error && 'code' in error && (error as Error & { code: string }).code === "23505") {
        return { success: false, error: "You have already requested early access." };
      }
      console.error("Error creating early access request:", error);
      return { success: false, error: "Could not save your request. Please try again." };
    }

    // 3. Log the lead event
    try {
      await logLeadEvent(
        leadId,
        "EARLY_ACCESS_REQUEST",
        "EARLY_ACCESS", // source
        {
          source: validatedData.source,
          preferredPropertyType: validatedData.preferredPropertyType,
        }
      );
    } catch (error) {
      console.error("Error logging lead event:", error);
      // Non-critical error, so we don't return a failure to the user
    }

    // Send Internal Notification Email
    const internalEmailHtml = `
      <h1>New Early Access request</h1>
      <p>A new user has requested early access to ComfHutt.</p>
      <p><strong>Email:</strong> ${validatedData.email}</p>
      <p><strong>Name:</strong> ${validatedData.name || "N/A"}</p>
      <p><strong>Investment Intent:</strong> ${validatedData.investmentIntent}</p>
      <p><strong>Expected Investment Range:</strong> ${validatedData.expectedInvestmentRange}</p>
      <p><strong>Preferred Property Type:</strong> ${validatedData.preferredPropertyType || "N/A"}</p>
    `;
    await sendEmail(
      "internal@comfhutt.com", // Replace with your internal team's email
      "New Early Access request",
      internalEmailHtml
    );

    // Send User Confirmation Email
    const userEmailHtml = `
      <p>Hi ${validatedData.name || "there"},</p>
      <p>Thanks for joining the ComfHutt early access list.</p>
      <p>We're currently preparing the first set of properties and onboarding flows. You'll hear from us before the public launch when early access opens.</p>
      <p>— Team ComfHutt</p>
    `;
    await sendEmail(
      validatedData.email,
      "You're on the ComfHutt early access list",
      userEmailHtml
    );

    const duration = Date.now() - startTime;
    console.log(`[Waitlist] Success: ${validatedData.email} (took ${duration}ms)`);
    
    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }

    if (error instanceof Error && 'code' in error && (error as Error & { code: string }).code === 'P2002') {
      console.log(`[Waitlist] Race condition duplicate: ${data.email}`);
      return { success: false, error: "This email is already on the waitlist." };
    }

    if (error instanceof Error && 'code' in error && (error as Error & { code: string }).code === 'P1001') {
      console.error(`[Waitlist] Database connection error after ${duration}ms:`, error);
      return { success: false, error: "Unable to connect to the database. Please try again later." };
    }

    console.error(`[Waitlist] Error after ${duration}ms:`, error);
    
    // Don't expose raw DB errors to client
    return { success: false, error: "Unable to join waitlist at this time. Please try again later." };
  }
}
