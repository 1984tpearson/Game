import { createClient } from '@supabase/supabase-js';

// This key is a "publishable" key — it's meant to be embedded in frontend
// code and is safe to be public (unlike a service-role key). Access control
// for the tables it can reach is enforced by Postgres Row Level Security
// policies on the Supabase project itself, not by keeping this key secret.
//
// Current state: the `tiles` table has RLS enabled but with fully open
// read/write policies (no auth) — anyone with this key can save, edit, or
// delete any tile. That was a deliberate "get it working first" choice;
// tighten this with real policies (e.g. requiring auth, or a shared
// secret check) before this site has a real audience.
const SUPABASE_URL = "https://keqzqhykfygplolcnxnn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w0h8f1AIXQGty5X5nKrJtg_ThI1-a-j";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
