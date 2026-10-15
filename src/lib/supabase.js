import { createClient } from "@supabase/supabase-js";
import { DEMO, createDemoClient } from "./demo.js";
import { withOffline, netFetch } from "./offline.js";

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export { DEMO };
export const CONFIGURED = DEMO || Boolean(url && anon);
// Wrapped by the offline layer (offline.js): reads fall back to the copy on
// this computer and writes queue while there's no connection.
export const sb = DEMO
  ? withOffline(createDemoClient())
  : (CONFIGURED
      ? withOffline(createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: netFetch } }), { url, anon })
      : null);
