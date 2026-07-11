import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// Load the monorepo-root .env so `prisma db push` / `migrate` find DATABASE_URL
// and DIRECT_URL even though this package lives in packages/db.
loadEnv({ path: resolve(process.cwd(), "../../.env") });

export default defineConfig({
  schema: resolve(process.cwd(), "prisma/schema.prisma"),
});
