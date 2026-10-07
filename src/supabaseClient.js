import { createClient } from '@supabase/supabase-js';

// Replace with your actual Supabase URL and anon key from Project Settings -> API
const SUPABASE_URL = 'https://snfrplrypqjnqxftpkme.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZnJwbHJ5cHFqbnF4ZnRwa21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNTU4MzAsImV4cCI6MjEwNTczMTgzMH0.jR7_cSFSyYWAKexhLLZwO_-eZgT_lhb7EHllDaAiJ5U';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Approximate server_now ≈ Date.now() + offset. Measured from REST Date headers
// so guess-phase countdowns agree across clients despite local clock skew.
let serverTimeOffsetMs = 0;
let serverTimeOffsetPromise = null;

export const measureServerTimeOffset = () => {
  if (serverTimeOffsetPromise) return serverTimeOffsetPromise;
  serverTimeOffsetPromise = (async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/game_sessions?select=id&limit=1`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const t1 = Date.now();
      const dateHdr = res.headers.get('date');
      if (!dateHdr) return serverTimeOffsetMs;
      const serverMs = Date.parse(dateHdr);
      if (!Number.isFinite(serverMs)) return serverTimeOffsetMs;
      serverTimeOffsetMs = serverMs - (t0 + t1) / 2;
      return serverTimeOffsetMs;
    } catch {
      return serverTimeOffsetMs;
    }
  })();
  return serverTimeOffsetPromise;
};

export const getServerNowMs = () => Date.now() + serverTimeOffsetMs;

export const getServerNowIso = () => new Date(getServerNowMs()).toISOString();