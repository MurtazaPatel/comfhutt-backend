import { supabase } from "../lib/db";

export async function createContactMessage(
  leadId: string,
  subject: string,
  message: string,
  environment: string = "DEV"
) {
  if (!leadId) {
    throw new Error("createContactMessage: leadId is required");
  }

  const { error } = await supabase.rpc("create_contact_message", {
    _lead_id: leadId,
    _subject: subject,
    _message: message,
    _environment: environment,
  });

  if (error) {
    throw new Error(`Error creating contact message: ${error.message}`);
  }
}
