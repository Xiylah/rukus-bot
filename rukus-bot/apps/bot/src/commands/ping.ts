import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check that the bot is alive and see its latency"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.reply({
      content: `🏓 Pong! WebSocket latency: ${Math.round(
        interaction.client.ws.ping,
      )}ms`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
