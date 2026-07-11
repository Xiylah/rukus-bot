import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import type { BotClient, AnyCommand, EventHandler } from "./types.js";
import { isContextCommand } from "./types.js";
import { log } from "./logger.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Recursively collect .ts/.js module files under a directory. */
function collectModuleFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectModuleFiles(full));
    } else if (/\.(ts|js)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Load every command under src/commands and register it on the client.
 * Handles both slash commands and message context-menu commands, and returns
 * the combined list (their `.data` builders) for deployment.
 */
export async function loadCommands(client: BotClient): Promise<AnyCommand[]> {
  const dir = resolve(here, "..", "commands");
  const all: AnyCommand[] = [];
  for (const file of collectModuleFiles(dir)) {
    const mod = await import(pathToFileURL(file).href);
    const command: AnyCommand | undefined = mod.default ?? mod.command;
    if (!command?.data || !command.execute) {
      log.warn(`Skipping ${file}: not a valid command module`);
      continue;
    }
    if (isContextCommand(command)) {
      client.contextCommands.set(command.data.name, command);
    } else {
      client.commands.set(command.data.name, command);
    }
    all.push(command);
  }
  log.info(
    `Loaded ${client.commands.size} slash + ${client.contextCommands.size} context command(s).`,
  );
  return all;
}

/** Load every event handler under src/events and wire it to the client. */
export async function loadEvents(client: BotClient): Promise<number> {
  const dir = resolve(here, "..", "events");
  let count = 0;
  for (const file of collectModuleFiles(dir)) {
    const mod = await import(pathToFileURL(file).href);
    const handler: EventHandler | undefined = mod.default ?? mod.event;
    if (!handler?.name || !handler.execute) {
      log.warn(`Skipping ${file}: not a valid event module`);
      continue;
    }
    if (handler.once) {
      client.once(handler.name, (...args) => handler.execute(...args));
    } else {
      client.on(handler.name, (...args) => handler.execute(...args));
    }
    count++;
  }
  log.info(`Loaded ${count} event handler(s).`);
  return count;
}
