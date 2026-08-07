import { rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Remove the stale build output in .next, but NOT .next/cache.
 *
 * The manifest bug ("Could not find the module in the React Client Manifest")
 * came from a stale client manifest carried across Railway deploys. The manifest
 * lives in .next/server and .next/static, so wiping those fixes it.
 *
 * .next/cache must be left alone: Railway mounts it as a persistent volume to
 * speed builds, and rmdir on a mount point fails with EBUSY (which is exactly
 * what broke the previous attempt to delete all of .next). Deleting only the
 * siblings clears the manifest without touching the mount.
 *
 * Missing .next (a fresh checkout) is fine: readdir throws ENOENT, we ignore it.
 */
const NEXT_DIR = ".next";
const KEEP = new Set(["cache"]);

let entries;
try {
  entries = readdirSync(NEXT_DIR, { withFileTypes: true });
} catch {
  // No .next yet (first build). Nothing to clean.
  process.exit(0);
}

for (const entry of entries) {
  if (KEEP.has(entry.name)) continue;
  rmSync(join(NEXT_DIR, entry.name), { recursive: true, force: true });
}
