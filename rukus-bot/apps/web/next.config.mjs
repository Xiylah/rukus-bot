import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Next only reads .env files from its own directory (apps/web), but this is a
// monorepo with a single shared .env at the root. Load it here — this runs
// before the app boots, in both `next dev` and `next build`.
// In production (Cloudflare/Railway) there is no .env file and the platform's
// real environment variables are used instead, so this is a no-op there.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // These TS-source workspace packages must be compiled by Next.
  transpilePackages: ["@rukus/supabase", "@rukus/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  webpack: (config) => {
    // The @rukus/supabase and @rukus/shared packages are TS source that uses
    // explicit ".js" import specifiers (NodeNext ESM style). Teach webpack to
    // resolve those specifiers to the ".ts"/".tsx" source so Next can compile
    // the workspace packages directly.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
