import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("See everything the bot can do"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle("Rukus Bot")
      .setDescription("Everything is also configurable on the web dashboard.")
      .addFields(
        {
          name: "🎫 Tickets",
          value:
            "`/ticket panel` post the ticket panel\n" +
            "`/ticket setup` quick setup\n" +
            "`/ticket close` `claim` `add` `remove` manage a ticket (staff)",
        },
        {
          name: "📝 Forms",
          value:
            "`/form panel` post the applications panel\n" +
            "`/form list` list configured forms",
        },
        {
          name: "🌐 Translation",
          value:
            "`/translate` translate text\n" +
            "Right-click a message > Apps > Translate / Detect Language\n" +
            "React with a flag emoji to translate a message\n" +
            "`/translation` configure auto-translate (admin)",
        },
        {
          name: "💬 Auto-responder",
          value:
            "Answers common questions automatically.\n" +
            "`/autoresponder` configure it (admin)",
        },
        {
          name: "🛡️ Moderation",
          value:
            "`/warn` `/timeout` `/kick` `/ban` take action, each recorded as a case\n" +
            "`/history` shows a member's full record\n" +
            "Auto-filters: drug terms, banned words, invite links, mass mentions\n" +
            "`/moderation` configure filters (admin)\n" +
            "`/purge` bulk-delete, `/slowmode` set channel slowmode",
        },
        {
          name: "👋 Welcome",
          value:
            "Welcome/leave messages, auto-roles on join, welcome DMs.\n" +
            "`/welcome` configure it (admin)",
        },
        {
          name: "🔧 Utility",
          value:
            "`/serverinfo` `/userinfo` `/avatar` info commands\n" +
            "`/ping` check the bot is alive",
        },
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
