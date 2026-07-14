import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { listLockedChannels, setLockedChannels } from "../features/roles/state.js";
import { restoreChannelLock } from "../features/roles/sweeper.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("unlockdown")
    .setDescription("Reopen a locked channel (or every locked channel)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Which channel (omit to unlock everything that's locked)")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.GuildForum,
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guild = interaction.guild;

    const locked = await listLockedChannels(guild.id);
    if (locked.length === 0) {
      await interaction.reply({
        content: "Nothing is locked down right now.",
        ...ephemeral,
      });
      return;
    }

    const picked = interaction.options.getChannel("channel");
    const targets = picked
      ? locked.filter((l) => l.channelId === picked.id)
      : locked;

    if (targets.length === 0) {
      await interaction.reply({
        content: `${picked} isn't locked (at least not by me).`,
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const reason = `Unlocked by ${interaction.user.tag}`;
    let restored = 0;
    for (const entry of targets) {
      // Restore the pre-lock override, not a blanket "allow": see the comment
      // on LockedChannel.previous.
      const ok = await restoreChannelLock(guild, entry, reason);
      if (ok) restored++;
    }

    const remaining = locked.filter((l) => !targets.includes(l));
    await setLockedChannels(guild.id, remaining);

    await interaction.editReply({
      content:
        `🔓 Unlocked **${restored}** channel(s).` +
        (remaining.length ? ` ${remaining.length} still locked.` : ""),
    });
  },
};

export default command;
