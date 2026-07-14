import { Events, type Invite } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  configFor,
  emit,
  shouldLog,
  userLine,
} from "../features/logging/index.js";

const handler: EventHandler<Events.InviteCreate> = {
  name: Events.InviteCreate,
  execute: async (invite: Invite) => {
    const guild = invite.guild;
    // Group-DM invites have no guild, and `guild` is typed loosely enough that
    // the id check is the only reliable way to know we have a real one.
    if (!guild || !("id" in guild)) return;
    const full = invite.client.guilds.cache.get(guild.id);
    if (!full) return;

    const config = await configFor(full);
    if (!config) return;
    if (
      !shouldLog(config, "inviteCreate", {
        channelId: invite.channelId,
        userId: invite.inviter?.id,
        isBot: invite.inviter?.bot,
      })
    ) {
      return;
    }

    await emit(
      full,
      "inviteCreate",
      base("🔗 Invite created", LOG_COLORS.create, invite.inviter).addFields(
        { name: "Code", value: `\`${invite.code}\``, inline: true },
        {
          name: "Channel",
          value: invite.channelId ? `<#${invite.channelId}>` : "Unknown",
          inline: true,
        },
        { name: "Created by", value: userLine(invite.inviter), inline: true },
        {
          name: "Max uses",
          value: invite.maxUses ? String(invite.maxUses) : "Unlimited",
          inline: true,
        },
        {
          name: "Expires",
          value: invite.expiresTimestamp
            ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>`
            : "Never",
          inline: true,
        },
      ),
    );
  },
};

export default handler;
