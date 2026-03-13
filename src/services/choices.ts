import { supabase } from "../lib/db";

export async function createChoiceResponses(
  leadId: string,
  responses: Array<{ key: string; value: string }>,
  environment: string = "DEV"
) {
  if (!leadId) {
    throw new Error("createChoiceResponses: leadId is required");
  }

  const { error } = await supabase.rpc("create_choice_responses", {
    _lead_id: leadId,
    _responses: responses,
    _environment: environment,
  });

  if (error) {
    throw new Error(`Error creating choice responses: ${error.message}`);
  }
}
