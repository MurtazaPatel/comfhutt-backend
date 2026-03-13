import { supabase } from "../lib/db";

export async function createUser(email: string, passwordHash: string, name?: string) {
    const { error } = await supabase.rpc("create_user", {
        _email: email,
        _password_hash: passwordHash,
        _name: name || email.split("@")[0],
    });

    if (error) {
        throw new Error(`Error creating user: ${error.message}`);
    }
}

export async function getUserByEmail(email: string) {
    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();
    
    if (error && error.code !== "PGRST116") {
        throw new Error(`Error fetching user: ${error.message}`);
    }

    return data;
}
