import { supabase } from "../lib/db";
import { AppError } from "../modules/crux/shared/errors";

interface ClerkUserPayload {
  clerkUserId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  provisionedVia: 'webhook' | 'sync';
}

export async function syncUserToSupabase(
  payload: ClerkUserPayload
): Promise<void> {
  const { clerkUserId, email, phone, displayName, provisionedVia } = payload;

  const { error } = await supabase
    .from("crux_users")
    .upsert(
      {
        clerk_user_id: clerkUserId,
        email: email ?? null,
        phone: phone ?? null,
        display_name: displayName ?? null,
        provisioned_via: provisionedVia,
      },
      {
        onConflict: "clerk_user_id",
        ignoreDuplicates: true,
      }
    );

  if (error) {
    console.error({ clerkUserId, error }, "UserSync: Supabase upsert failed");
    throw new AppError(
      500,
      "USER_SYNC_FAILED",
      "Failed to sync user profile."
    );
  }

  console.log({ clerkUserId }, "UserSync: user synced to crux_users");
}

export async function getUserFromSupabase(clerkUserId: string) {
  const { data, error } = await supabase
    .from("crux_users")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    console.error({ clerkUserId, error }, "UserSync: fetch failed");
    throw new AppError(500, "USER_FETCH_FAILED", "Failed to fetch user profile.");
  }

  return data;
}
