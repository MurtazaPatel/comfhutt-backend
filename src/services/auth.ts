import { supabase, supabaseAuth } from "../lib/db";

export const register = async (email: string, password: string, name?: string) => {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: { name: name || email.split("@")[0] },
    email_confirm: true,
  });

  if (error) {
    if (error.message.includes("already exists") || error.code === "user_already_exists") {
      throw new Error("Email already in use");
    }
    throw new Error(`Error creating user: ${error.message}`);
  }

  return data.user;
};

export const login = async (email: string, password: string) => {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error("Invalid credentials");
  }

  return { user: data.user, session: data.session };
};

export const loginWithGoogle = async () => {
  // Note: Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET configured in Supabase dashboard
  const { data, error } = await supabaseAuth.auth.signInWithOAuth({
    provider: 'google',
  });

  if (error) {
    throw new Error(`Error initiating Google login: ${error.message}`);
  }

  return { url: data.url };
};

export const refreshSession = async (refresh_token: string) => {
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });
  
  if (error) {
    throw new Error(`Error refreshing session: ${error.message}`);
  }

  return { session: data.session };
};

export const logout = async (access_token: string) => {
  const { error } = await supabase.auth.admin.signOut(access_token);
  
  if (error) {
    throw new Error(`Error signing out: ${error.message}`);
  }

  return { success: true };
};

export const getUser = async (access_token: string) => {
  const { data, error } = await supabaseAuth.auth.getUser(access_token);
  
  if (error || !data.user) {
    throw new Error("Invalid token");
  }

  return data.user;
};
