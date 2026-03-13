import { supabase } from "../lib/db";

export async function upsertLead(
  email: string,
  name: string | undefined | null,
  source: string,
  environment: string = "DEV"
) {
  const { data: leadId, error } = await supabase.rpc("upsert_lead", {
    _email: email,
    _name: name || null,
    _source: source,
    _environment: environment,
  });

  if (error) {
    throw new Error(`Error upserting lead: ${error.message}`);
  }

  if (!leadId || typeof leadId !== "string") {
    throw new Error("Upserted lead is missing ID");
  }

  return leadId;
}

export async function logLeadEvent(
  leadId: string,
  eventType: string,
  source: string,
  metadata?: Record<string, unknown>,
  environment: string = "DEV"
) {
  const { error } = await supabase.rpc("log_lead_event", {
    _lead_id: leadId,
    _event_type: eventType,
    _source: source,
    _metadata: metadata || null,
    _environment: environment,
  });

  if (error) {
    throw new Error(`Error logging lead event: ${error.message}`);
  }
}
