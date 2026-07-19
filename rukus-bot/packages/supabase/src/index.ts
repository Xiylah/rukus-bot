import { createClient } from "@supabase/supabase-js";

export * from "./config.js";
export * from "./leveling.js";
export * from "./contests.js";

/**
 * The client's type is specialized to the `rukus` schema by the db option, so
 * we derive the type from createClient rather than the default SupabaseClient
 * (whose schema generic defaults to "public").
 */
type RukusClient = ReturnType<typeof makeClient>;

/**
 * Supabase (PostgREST) client for the DASHBOARD.
 *
 * This is the edge-compatible data door: it works on Cloudflare Pages/Workers
 * where Prisma's raw Postgres connection does not. The BOT still uses Prisma
 * (@rukus/db) on Node.js - both hit the same tables.
 *
 * We use the SERVICE ROLE key here, which bypasses row-level security. That is
 * safe ONLY because every call site is server-side code that has already
 * authenticated the admin via Discord OAuth and checked guild access. This key
 * must never be exposed to the browser.
 */
function makeClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // The bot's tables live in the dedicated `rukus` schema (isolated from the
    // Roblox game's `public` tables), so PostgREST must target it by default.
    db: { schema: "rukus" },
  });
}

let cached: RukusClient | null = null;

export function getSupabase(): RukusClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the dashboard.",
    );
  }
  cached = makeClient(url, key);
  return cached;
}
