import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";

let clientInstance;
try {
  clientInstance = createClient(supabaseUrl, supabaseAnonKey);
} catch (err) {
  console.warn("Supabase client creation fallback triggered:", err);
  clientInstance = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  };
}

export const supabase = clientInstance;
