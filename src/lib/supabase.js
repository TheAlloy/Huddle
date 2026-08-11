import { createClient } from "@supabase/supabase-js";
import { DEMO, createDemoClient } from "./demo.js";

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export { DEMO };
export const CONFIGURED = DEMO || Boolean(url && anon);
export const sb = DEMO
  ? createDemoClient()
  : (CONFIGURED
      ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
      : null);
