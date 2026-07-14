import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

// Load the monorepo-root .env regardless of where the process is launched from.
// (apps/bot/src/env.ts → ../../../../.env resolves to rukus-bot/.env)
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });
// Also load a bot-local .env if present (overrides root); harmless if absent.
loadEnv({ path: resolve(here, "../.env"), override: false });

/**
 * Validate required environment at startup so we fail fast with a clear message
 * instead of a cryptic error deep inside discord.js or Prisma.
 *
 * dotenv loads the monorepo-root .env when the bot is run from apps/bot; in
 * production (Railway) the vars come from the environment directly.
 */
const schema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  // Optional: the bot is public and serves any guild that adds it. This is only
  // a DEV convenience - when set, commands are also registered to this one guild
  // so changes appear instantly instead of waiting on global propagation.
  DISCORD_GUILD_ID: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Hosts (Railway included) can inject NODE_ENV as an EMPTY STRING. Zod's
  // .default() only fires on `undefined`, so a bare enum would reject "" and
  // kill the bot on boot. Coerce anything unrecognized to "production" - this
  // is a deploy-time convenience flag, never worth crashing over.
  NODE_ENV: z
    .string()
    .optional()
    .transform((v) =>
      v === "development" || v === "test" ? v : "production",
    ),
  // Optional: enables the higher-quality DeepL engine (Google is the fallback).
  DEEPL_API_KEY: z.string().optional(),
  // Optional: the dashboard's public URL. When set, ticket transcripts get a
  // hosted "Direct Link" (DASHBOARD_URL/transcript/<token>).
  DASHBOARD_URL: z.string().optional(),
});

// Treat empty-string vars as absent, so an unset-but-present var (common on
// hosting platforms) falls through to its default instead of failing a check.
const cleanedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== ""),
);

const parsed = schema.safeParse(cleanedEnv);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
