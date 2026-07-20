import { writeFileSync } from "node:fs";
import { Collection } from "discord.js";
import { loadCommands } from "./lib/loaders.js";
import { log } from "./lib/logger.js";
import type { BotClient } from "./lib/types.js";

/**
 * Writes the slash command payload to commands.json:  pnpm bot:export-commands
 *
 * Same body deploy-commands.ts PUTs to Discord, but to a file instead. Listing
 * sites (top.gg) take a paste of that payload rather than calling Discord for
 * it, so this exists to produce something to paste. No token is needed: the
 * payload is built from the local command modules, not fetched.
 */
async function main() {
  // Only the registries are needed, so stub a minimal client shape.
  const stub = {
    commands: new Collection(),
    contextCommands: new Collection(),
  } as unknown as BotClient;
  const commands = await loadCommands(stub);

  // Context-menu entries are filtered out: they carry a `type` and no
  // description, which command listings have nothing to show for.
  const body = commands
    .map((c) => c.data.toJSON())
    .filter((c) => !("type" in c) || c.type === 1)
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = "commands.json";
  writeFileSync(out, JSON.stringify(body, null, 2));
  log.info(`Wrote ${body.length} slash command(s) to ${out}.`);
}

main().catch((err) => {
  log.error("Command export failed:", err);
  process.exit(1);
});
