import {
  SlashCommandBuilder,
  ComponentType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";
import { economyConfig } from "../lib/configCache.js";
import { topPage } from "../features/economy/service.js";
import {
  richestEmbed,
  richestButtons,
  RICH_CID,
} from "../features/economy/ui.js";

const PER_PAGE = 10;
/** How long the pager keeps working before the buttons go dead. */
const COLLECTOR_MS = 5 * 60_000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("richest")
    .setDescription("Show the server's richest members")
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

    const config = await economyConfig(interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({
        content: "The economy is turned off in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const guild = interaction.guild;
    let page = interaction.options.getInteger("page") ?? 1;

    const first = await topPage(guildId, page, PER_PAGE);
    page = Math.min(page, first.pages);

    const message = await interaction.reply({
      embeds: [
        richestEmbed(
          guild,
          config,
          first.rows,
          page,
          first.pages,
          first.total,
          PER_PAGE,
        ),
      ],
      components:
        first.pages > 1
          ? [richestButtons(page, first.pages, interaction.user.id)]
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
      if (!button.customId.startsWith(RICH_CID)) return;
      // Anyone can run /richest themselves; letting a bystander page someone
      // else's message just makes it jump under the owner's cursor.
      if (button.user.id !== interaction.user.id) {
        await button.reply({
          content: "Run `/richest` yourself to page through it.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const target = Number(button.customId.split(":")[3] ?? "1");
      const next = await topPage(guildId, target, PER_PAGE);
      const shown = Math.min(Math.max(1, target), next.pages);

      await button.update({
        embeds: [
          richestEmbed(
            guild,
            config,
            next.rows,
            shown,
            next.pages,
            next.total,
            PER_PAGE,
          ),
        ],
        components: [richestButtons(shown, next.pages, interaction.user.id)],
      });
    });

    collector.on("end", async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};

export default command;
