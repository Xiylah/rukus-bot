import {
  SlashCommandBuilder,
  ComponentType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";
import { levelingConfig } from "../lib/configCache.js";
import { getLeaderboard } from "../features/leveling/service.js";
import {
  leaderboardEmbed,
  leaderboardButtons,
  LB_CID,
} from "../features/leveling/ui.js";

const PER_PAGE = 10;
/** How long the pager keeps working before the buttons go dead. */
const COLLECTOR_MS = 5 * 60_000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server's XP leaderboard")
    .setDMPermission(false)
    .addIntegerOption((o) =>
      o
        .setName("page")
        .setDescription("Which page to start on")
        .setMinValue(1)
        .setMaxValue(1000),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await levelingConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "Leveling is turned off in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const guild = interaction.guild;
    let page = interaction.options.getInteger("page") ?? 1;

    const first = await getLeaderboard(guildId, page, PER_PAGE);
    page = Math.min(page, first.pages);

    const message = await interaction.reply({
      embeds: [
        leaderboardEmbed(guild, first.rows, page, first.pages, first.total, PER_PAGE),
      ],
      components:
        first.pages > 1
          ? [leaderboardButtons(page, first.pages, interaction.user.id)]
          : [],
      withResponse: true,
    });

    if (first.pages <= 1) return;

    // A collector on this one reply keeps the pager entirely self-contained: no
    // entry in the global interaction router, and it dies with the message.
    const collector = message.resource!.message!.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COLLECTOR_MS,
    });

    collector.on("collect", async (button) => {
      if (!button.customId.startsWith(LB_CID)) return;
      // Anyone can run /leaderboard themselves; letting a bystander page someone
      // else's message just makes it jump under the owner's cursor.
      if (button.user.id !== interaction.user.id) {
        await button.reply({
          content: "Run `/leaderboard` yourself to page through it.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const target = Number(button.customId.split(":")[3] ?? "1");
      const next = await getLeaderboard(guildId, target, PER_PAGE);
      const shown = Math.min(Math.max(1, target), next.pages);

      await button.update({
        embeds: [
          leaderboardEmbed(guild, next.rows, shown, next.pages, next.total, PER_PAGE),
        ],
        components: [leaderboardButtons(shown, next.pages, interaction.user.id)],
      });
    });

    collector.on("end", async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};

export default command;
