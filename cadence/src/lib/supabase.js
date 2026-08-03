import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const CONFIGURED = Boolean(url && anon);
export const sb = CONFIGURED
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
