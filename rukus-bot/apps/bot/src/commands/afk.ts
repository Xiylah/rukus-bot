import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { afkConfig } from "../lib/configCache.js";
import { setAfk } from "../features/afk/afk.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Mark yourself away, so pings get an automatic answer")
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("message")
        .setDescription("What to tell people who ping you")
        .setMaxLength(200),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await afkConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "AFK is turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    const message = interaction.options.getString("message") ?? "Away from keyboard";
    const { nicknameChanged } = await setAfk(interaction.member, message);

    await interaction.reply({
      content:
        `💤 You're now AFK: ${message}` +
        (nicknameChanged ? "" : "\n(I couldn't add the [AFK] tag to your nickname.)") +
        "\nSend any message to come back.",
      ...ephemeral,
    });
  },
};

export default command;
