import { Events, type Client } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";

const handler: EventHandler<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute: (client: Client) => {
    log.info(`Logged in as ${client.user?.tag} (id: ${client.user?.id}).`);
    log.info(`Serving ${client.guilds.cache.size} guild(s).`);
    client.user?.setActivity("your tickets & forms");
  },
};

export default handler;
