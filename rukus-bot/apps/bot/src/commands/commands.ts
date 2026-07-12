import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import { customCommandsConfig } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("commands")
    .setDescription("List this server's custom commands")
    .setDMPermission(false),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const config = await customCommandsConfig(interaction.guildId);

    const usable = config.commands.filter((c) => {
      if (!c.enabled) return false;
      if (c.allowedRoleIds.length === 0) return true;
      return c.allowedRoleIds.some((r) =>
        interaction.member.roles.cache.has(r),
      );
    });

    if (!config.enabled || usable.length === 0) {
      await interaction.reply({
        content: "This server has no custom commands yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = usable.map((c) => {
      const aliases = c.aliases.length
        ? ` (also ${c.aliases.map((a) => `${config.prefix}${a}`).join(", ")})`
        : "";
      return `**${config.prefix}${c.name}**${aliases}`;
    });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Custom commands")
          .setDescription(lines.join("\n").slice(0, 4000)),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
