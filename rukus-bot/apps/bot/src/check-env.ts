/**
 * Pre-flight check:  pnpm check-env
 *
 * Validates every required environment value and — crucially — actually calls
 * Discord and Supabase to prove the credentials WORK, rather than just being
 * present. Run this before deploying so failures surface here, not in prod.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

let failures = 0;
let warnings = 0;

function ok(label: string, detail = "") {
  console.log(`  ${GREEN}✔${RESET} ${label}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}
function bad(label: string, hint: string) {
  failures++;
  console.log(`  ${RED}✘${RESET} ${label}\n      ${DIM}→ ${hint}${RESET}`);
}
function warn(label: string, hint: string) {
  warnings++;
  console.log(`  ${YELLOW}!${RESET} ${label}\n      ${DIM}→ ${hint}${RESET}`);
}

/** Present-and-non-placeholder check. */
function present(name: string): string | null {
  const v = process.env[name]?.trim();
  if (!v) return null;
  if (/PASSWORD|PROJECTREF|HOST|^$/.test(v)) return null; // still a template value
  return v;
}

async function main() {
  console.log("\n🔍 Checking environment…\n");

  // ---- Discord ----
  console.log("Discord");
  const token = present("DISCORD_BOT_TOKEN");
  const clientId = present("DISCORD_CLIENT_ID");
  const clientSecret = present("DISCORD_CLIENT_SECRET");
  const guildId = present("DISCORD_GUILD_ID");

  if (!token) {
    bad("DISCORD_BOT_TOKEN missing", "Railway → your bot service → Variables → TOKEN");
  } else {
    // Live check: ask Discord who this token belongs to.
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const me = (await res.json()) as { username: string; id: string };
      ok("DISCORD_BOT_TOKEN valid", `→ logged in as ${me.username} (${me.id})`);
      if (clientId && clientId !== me.id) {
        warn(
          "DISCORD_CLIENT_ID doesn't match the token's application",
          `token belongs to app ${me.id}, but CLIENT_ID is ${clientId}`,
        );
      }
    } else {
      bad(
        `DISCORD_BOT_TOKEN rejected by Discord (${res.status})`,
        "Token is wrong or was reset. Copy it again from the Developer Portal.",
      );
    }
  }

  if (!clientId) bad("DISCORD_CLIENT_ID missing", "Dev Portal → General Information → Application ID");
  else ok("DISCORD_CLIENT_ID set");

  if (!clientSecret) bad("DISCORD_CLIENT_SECRET missing", "Dev Portal → OAuth2 → Client Secret (needed for dashboard login)");
  else ok("DISCORD_CLIENT_SECRET set");

  if (!guildId) bad("DISCORD_GUILD_ID missing", "Right-click your server → Copy Server ID");
  else ok("DISCORD_GUILD_ID set", `→ ${guildId}`);

  // Does the bot actually have access to the guild?
  if (token && guildId) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const g = (await res.json()) as { name: string };
      ok("Bot is in the guild", `→ "${g.name}"`);
    } else {
      warn(
        "Bot can't see that guild",
        "Invite the bot to your server (see README for the invite URL).",
      );
    }
  }

  // ---- Database (bot side) ----
  console.log("\nDatabase (bot / Prisma)");
  const dbUrl = present("DATABASE_URL");
  if (!dbUrl) {
    bad("DATABASE_URL missing", "Supabase → Connect → Connection string (starts with postgresql://)");
  } else if (!dbUrl.startsWith("postgresql://")) {
    bad("DATABASE_URL is not a Postgres URL", "It must start with postgresql:// — not https://…supabase.co");
  } else {
    // The Supabase DIRECT host (db.<ref>.supabase.co) is IPv6-only. Railway
    // has no IPv6 egress, so the bot works locally but dies in production with
    // "Can't reach database server". The pooler host has IPv4 — always use it.
    if (/@db\.[a-z0-9]+\.supabase\.co/.test(dbUrl)) {
      warn(
        "DATABASE_URL uses the IPv6-only DIRECT host — this fails on Railway",
        "Switch to the pooler: Supabase → Connect → Transaction pooler " +
          "(aws-N-<region>.pooler.supabase.com:6543). It works locally but NOT " +
          "in production.",
      );
    }
    try {
      const { prisma } = await import("@rukus/db");
      await prisma.$queryRawUnsafe("SELECT 1");
      const n = await prisma.featureConfig.count();
      ok("Database reachable", `→ rukus schema OK (${n} config row(s))`);
      await prisma.$disconnect();
    } catch (e) {
      bad(`Database connection failed`, String((e as Error).message).split("\n")[0] ?? "");
    }
  }

  // ---- Supabase (dashboard side) ----
  console.log("\nSupabase (dashboard / REST)");
  const sbUrl = present("SUPABASE_URL");
  const sbKey = present("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl) bad("SUPABASE_URL missing", "e.g. https://<ref>.supabase.co");
  else if (sbUrl.includes("/rest/v1")) {
    bad("SUPABASE_URL should not include /rest/v1", `Use just https://<ref>.supabase.co`);
  } else ok("SUPABASE_URL set");

  if (!sbKey) {
    bad("SUPABASE_SERVICE_ROLE_KEY missing", "Supabase → Settings → API → service_role key");
  } else if (sbUrl) {
    // Live check: can PostgREST see the `rukus` schema?
    const res = await fetch(`${sbUrl}/rest/v1/FeatureConfig?select=id&limit=1`, {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        "Accept-Profile": "rukus",
      },
    });
    if (res.ok) {
      ok("Supabase REST can read the rukus schema");
    } else {
      const body = await res.text();
      // Two distinct failures, easy to confuse:
      //  - PGRST106 / "Invalid schema" → schema not exposed in the Supabase UI
      //  - 42501 / "permission denied" → exposed, but the API roles lack grants
      if (body.includes("42501") || body.includes("permission denied")) {
        bad(
          "Supabase roles lack permission on the `rukus` schema",
          "Run the grants: psql < packages/db/prisma/grants.sql, or paste that " +
            "file into Supabase → SQL Editor. (Prisma made the schema, so " +
            "Supabase never granted its API roles access.)",
        );
      } else if (
        body.includes("PGRST106") ||
        body.includes("Invalid schema") ||
        res.status === 406
      ) {
        bad(
          "The `rukus` schema isn't exposed to the API",
          "Supabase → Settings → API → Data API → Exposed schemas → add `rukus` → SAVE",
        );
      } else {
        bad(`Supabase REST error (${res.status})`, body.slice(0, 140));
      }
    }
  }

  // ---- Dashboard auth ----
  console.log("\nDashboard auth");
  const authSecret = present("AUTH_SECRET");
  if (!authSecret) bad("AUTH_SECRET missing", "Run: openssl rand -base64 32");
  else if (authSecret.length < 32) warn("AUTH_SECRET looks short", "Should be a 32-byte base64 string");
  else ok("AUTH_SECRET set");

  const nextUrl = present("NEXTAUTH_URL");
  if (!nextUrl) warn("NEXTAUTH_URL missing", "http://localhost:3000 in dev; your real URL in prod");
  else ok("NEXTAUTH_URL set", `→ ${nextUrl}`);

  // ---- Optional ----
  console.log("\nOptional");
  if (present("DEEPL_API_KEY")) ok("DEEPL_API_KEY set", "→ higher-quality translations");
  else console.log(`  ${DIM}· DEEPL_API_KEY not set — translation falls back to Google (fine)${RESET}`);

  // ---- Summary ----
  console.log("");
  if (failures === 0) {
    console.log(`${GREEN}✅ All required checks passed.${RESET}` +
      (warnings ? ` ${YELLOW}(${warnings} warning(s))${RESET}` : ""));
    console.log(`${DIM}   Next: pnpm bot:deploy-commands  →  pnpm bot:dev${RESET}\n`);
  } else {
    console.log(`${RED}❌ ${failures} problem(s) to fix.${RESET}` +
      (warnings ? ` ${YELLOW}${warnings} warning(s).${RESET}` : ""));
    console.log(`${DIM}   Fix the items above in rukus-bot/.env, then re-run: pnpm check-env${RESET}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("check-env crashed:", e);
  process.exit(1);
});
