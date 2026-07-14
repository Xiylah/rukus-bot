import { AuditLogEvent, Events, type Guild } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  changeLine,
  configFor,
  emit,
  executorText,
  findExecutor,
  shouldLog,
} from "../features/logging/index.js";

const handler: EventHandler<Events.GuildUpdate> = {
  name: Events.GuildUpdate,
  execute: async (before: Guild, after: Guild) => {
    const config = await configFor(after);
    if (!config) return;
    if (!shouldLog(config, "serverUpdate")) return;

    const fields: { name: string; value: string }[] = [];

    if (before.name !== after.name) {
      fields.push({ name: "Server name", value: changeLine(before.name, after.name) });
    }
    if (before.ownerId !== after.ownerId) {
      fields.push({
        name: "Owner",
        value: changeLine(`<@${before.ownerId}>`, `<@${after.ownerId}>`),
      });
    }
    if (before.icon !== after.icon) {
      fields.push({ name: "Icon", value: "The server icon was changed." });
    }
    if (before.vanityURLCode !== after.vanityURLCode) {
      fields.push({
        name: "Vanity URL",
        value: changeLine(before.vanityURLCode, after.vanityURLCode),
      });
    }
    if (before.verificationLevel !== after.verificationLevel) {
      fields.push({
        name: "Verification level",
        value: changeLine(
          String(before.verificationLevel),
          String(after.verificationLevel),
        ),
      });
    }

    // Boost-count changes fire this event and are not settings changes.
    if (fields.length === 0) return;

    const executor = await findExecutor(after, AuditLogEvent.GuildUpdate);

    const embed = base("🏠 Server updated", LOG_COLORS.update).addFields(
      { name: "Changed by", value: executorText(executor) },
      ...fields,
    );
    const icon = after.iconURL();
    if (icon) embed.setThumbnail(icon);

    await emit(after, "serverUpdate", embed);
  },
};

export default handler;
