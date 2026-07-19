import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { PREMIUM_CHAR_LIMIT, quotaRemaining } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { env } from "../env.js";
import { premiumState } from "../lib/premiumCache.js";
import { isOperatorGuild } from "../features/premium/metering.js";

/** Width of the text progress bar, in cells. */
const BAR_CELLS = 20;

function bar(used: number, limit: number): string {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const filled = Math.round(ratio * BAR_CELLS);
  return `${"█".repeat(filled)}${"░".repeat(BAR_CELLS - filled)} ${Math.round(ratio * 100)}%`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Show this server's premium status and translation usage")
    .setDMPermission(false),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    // Anyone may look. Nothing here is sensitive, and a member who wants the
    // better translation engine should be able to see why they are not getting
    // it without having to ask an admin first.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setTitle("Premium")
      .setColor(0x5865f2);

    // Operator guilds bypass both the subscription and the meter, so reporting a
    // quota at them would be a lie: there is no counter to run out of.
    if (isOperatorGuild(interaction.guildId)) {
      embed
        .setDescription("This server has **unlimited** premium access.")
        .addFields({
          name: "Translation engine",
          value: "DeepL, uncapped",
        });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const state = await premiumState(interaction.guildId);
    const used = state.charactersUsed;
    const limit = state.charactersLimit || PREMIUM_CHAR_LIMIT;

    embed
      .setDescription(
        state.active
          ? `**Active** - ${state.reason}`
          : `**Inactive** - ${state.reason}`,
      )
      .addFields(
        {
          name: "Translation characters this month",
          value: `${bar(used, limit)}\n${used.toLocaleString()} / ${limit.toLocaleString()} (${quotaRemaining(used, limit).toLocaleString()} left)`,
        },
        {
          name: "Engine in use",
          value: state.active
            ? "DeepL (premium quality)"
            : "Google (free fallback, translation still works)",
        },
      );

    if (state.renewsAt) {
      const unix = Math.floor(state.renewsAt.getTime() / 1000);
      embed.addFields({
        name: state.cancelAtPeriodEnd ? "Access ends" : "Renews",
        value: `<t:${unix}:D>`,
      });
    }

    if (env.DASHBOARD_URL) {
      embed.addFields({
        name: "Manage",
        value: `[Open the premium page](${env.DASHBOARD_URL}/dashboard/${interaction.guildId}/premium)`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
