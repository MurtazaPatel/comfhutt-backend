export interface CruxUser {
  id: string;                    // Clerk user ID (clerk_user_id in crux_users)
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  isPro: boolean;
  watchCredits: number;          // default 3 on free tier
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeResponse {
  user: CruxUser;
}
