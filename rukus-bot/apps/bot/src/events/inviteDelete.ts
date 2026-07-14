import { Events, type Invite } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import {
  LOG_COLORS,
  base,
  configFor,
  emit,
  shouldLog,
} from "../features/logging/index.js";
import { forgetInvite } from "../features/invites/cache.js";

const handler: EventHandler<Events.InviteDelete> = {
  name: Events.InviteDelete,
  execute: async (invite: Invite) => {
    // Drop it from the tracker's snapshot, so a REVOKED invite is never mistaken
    // for one that was used up and auto-deleted.
    forgetInvite(invite);

    const guild = invite.guild;
    if (!guild || !("id" in guild)) return;
    const full = invite.client.guilds.cache.get(guild.id);
    if (!full) return;

    const config = await configFor(full);
    if (!config) return;
    // The delete event carries no inviter, so only the channel scope applies.
    if (!shouldLog(config, "inviteDelete", { channelId: invite.channelId })) return;

    await emit(
      full,
      "inviteDelete",
      base("🔗 Invite deleted", LOG_COLORS.destroy).addFields(
        { name: "Code", value: `\`${invite.code}\``, inline: true },
        {
          name: "Channel",
          value: invite.channelId ? `<#${invite.channelId}>` : "Unknown",
          inline: true,
        },
      ),
    );
  },
};

export default handler;
