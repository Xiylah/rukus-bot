import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk-delete recent messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("How many messages to delete (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("Only delete messages from this user"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");
    const channel = interaction.channel as TextChannel;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let deleted = 0;
    if (user) {
      const recent = await channel.messages.fetch({ limit: 100 });
      const targets = [...recent.values()]
        .filter((m) => m.author.id === user.id)
        .slice(0, amount);
      const result = await channel.bulkDelete(targets, true);
      deleted = result.size;
    } else {
      const result = await channel.bulkDelete(amount, true);
      deleted = result.size;
    }

    await interaction.editReply({
      content: `🧹 Deleted ${deleted} message(s)${user ? ` from ${user}` : ""}. (Discord can't bulk-delete messages older than 14 days.)`,
    });
  },
};

export default command;
