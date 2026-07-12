import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createCase } from "../features/moderation/cases.js";
import { guardTarget } from "../features/moderation/guards.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban or unban users")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Ban a user")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who to ban").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Why").setMaxLength(500),
        )
        .addIntegerOption((o) =>
          o
            .setName("delete_messages")
            .setDescription("Also delete their recent messages")
            .addChoices(
              { name: "Don't delete any", value: 0 },
              { name: "Last hour", value: 3600 },
              { name: "Last 24 hours", value: 86400 },
              { name: "Last 7 days", value: 604800 },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Unban a user by their ID")
        .addStringOption((o) =>
          o.setName("user_id").setDescription("The user's ID").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Why").setMaxLength(500),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    const reason = interaction.options.getString("reason") ?? undefined;

    if (sub === "add") {
      const target = interaction.options.getUser("user", true);
      const deleteSeconds = interaction.options.getInteger("delete_messages") ?? 0;
      const member = await interaction.guild.members
        .fetch(target.id)
        .catch(() => null);

      const blocked = guardTarget(interaction, target, member, "bannable");
      if (blocked) {
        await interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });
        return;
      }

      // Record + DM BEFORE the ban, or the DM can no longer be delivered.
      const number = await createCase({
        guild: interaction.guild,
        action: "BAN",
        target,
        moderatorId: interaction.user.id,
        reason,
      });
      await interaction.guild.members.ban(target.id, {
        reason: `${interaction.user.tag}: ${reason ?? "no reason"}`,
        deleteMessageSeconds: deleteSeconds,
      });

      await interaction.reply({
        content: `🔨 ${target.tag} was banned. Case #${String(number).padStart(4, "0")}.${reason ? ` Reason: ${reason}` : ""}`,
      });
      return;
    }

    // unban
    const userId = interaction.options.getString("user_id", true).trim();
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({
        content: "That doesn't look like a user ID.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await interaction.guild.members.unban(
        userId,
        `${interaction.user.tag}: ${reason ?? "no reason"}`,
      );
    } catch {
      await interaction.reply({
        content: "Couldn't unban that ID. Are they actually banned?",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const target = await interaction.client.users.fetch(userId).catch(() => null);
    const number = await createCase({
      guild: interaction.guild,
      action: "UNBAN",
      target: target ?? ({ id: userId, tag: userId, send: async () => {} } as never),
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({
      content: `🕊️ <@${userId}> was unbanned. Case #${String(number).padStart(4, "0")}.`,
    });
  },
};

export default command;
